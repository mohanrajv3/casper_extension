/**
 * CASPER Algorithm Implementation
 * Cryptographic Authentication with Secure Password Entry and Recovery
 */

class CasperCrypto {
  constructor() {
    this.DETECTION_SECRETS_COUNT = 5;
    this.SECRET_SIZE = 32; // 256 bits
    this.SALT_SIZE = 32;   // 256 bits
    this.IV_SIZE = 12;     // 96 bits for AES-GCM
  }

  /**
   * Generate k detection secrets (W = {w₁, w₂, w₃, w₄, w₅})
   * All secrets are cryptographically indistinguishable
   */
  generateDetectionSecrets(k = this.DETECTION_SECRETS_COUNT) {
    const secrets = [];
    for (let i = 0; i < k; i++) {
      const secret = new Uint8Array(this.SECRET_SIZE);
      crypto.getRandomValues(secret);
      secrets.push(secret);
    }
    return secrets;
  }

  /**
   * Select real secret from detection secrets using PIN
   * w* = Select(W, η)
   */
  selectSecret(secrets, pin) {
    if (!secrets || secrets.length === 0) {
      throw new Error('No detection secrets provided');
    }
    
    // Use simple modulo for deterministic selection
    const pinNumber = parseInt(pin);
    const index = pinNumber % secrets.length;
    
    console.log(`PIN ${pin} selects secret at index ${index} of ${secrets.length} secrets`);
    return secrets[index];
  }

  /**
   * Generate random salt for key derivation
   */
  generateSalt() {
    const salt = new Uint8Array(this.SALT_SIZE);
    crypto.getRandomValues(salt);
    return salt;
  }

  /**
   * Derive encryption key using HKDF
   * u = HKDF(w*, z)
   */
  async deriveEncryptionKey(secret, salt) {
    try {
      // Import secret as key material
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        secret,
        "HKDF",
        false,
        ["deriveKey"]
      );

      // Derive encryption key
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: salt,
          info: new TextEncoder().encode("CASPER-vault-key")
        },
        keyMaterial,
        {
          name: "AES-GCM",
          length: 256
        },
        true,
        ["encrypt", "decrypt"]
      );

      return derivedKey;
    } catch (error) {
      throw new Error(`Key derivation failed: ${error.message}`);
    }
  }

  /**
   * Encrypt vault data using AES-256-GCM
   */
  async encryptVault(vaultData, encryptionKey) {
    try {
      const iv = new Uint8Array(this.IV_SIZE);
      crypto.getRandomValues(iv);

      const encrypted = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv
        },
        encryptionKey,
        new TextEncoder().encode(JSON.stringify(vaultData))
      );

      // Combine IV and encrypted data
      const result = new Uint8Array(iv.length + encrypted.byteLength);
      result.set(iv);
      result.set(new Uint8Array(encrypted), iv.length);

      return result;
    } catch (error) {
      throw new Error(`Vault encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt vault data using AES-256-GCM
   */
  async decryptVault(encryptedData, encryptionKey) {
    try {
      if (encryptedData.length < this.IV_SIZE) {
        throw new Error('Invalid encrypted data length');
      }

      // Extract IV and encrypted data
      const iv = encryptedData.slice(0, this.IV_SIZE);
      const encrypted = encryptedData.slice(this.IV_SIZE);

      const decrypted = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv
        },
        encryptionKey,
        encrypted
      );

      const decryptedText = new TextDecoder().decode(decrypted);
      return JSON.parse(decryptedText);
    } catch (error) {
      throw new Error(`Vault decryption failed: ${error.message}`);
    }
  }

  /**
   * XOR encryption for passkey private keys
   * s̃ = u ⊕ s
   */
  xorEncrypt(privateKey, encryptionKey) {
    // Convert encryption key to raw bytes if it's a CryptoKey
    if (encryptionKey instanceof CryptoKey) {
      throw new Error('Use exportKey to get raw bytes for XOR encryption');
    }

    const maxLength = Math.max(privateKey.length, encryptionKey.length);
    const result = new Uint8Array(maxLength);

    for (let i = 0; i < maxLength; i++) {
      const pkByte = i < privateKey.length ? privateKey[i] : 0;
      const ekByte = i < encryptionKey.length ? encryptionKey[i] : 0;
      result[i] = pkByte ^ ekByte;
    }

    return result;
  }

  /**
   * XOR decryption (same as encryption - XOR is symmetric)
   */
  xorDecrypt(encryptedKey, encryptionKey) {
    return this.xorEncrypt(encryptedKey, encryptionKey);
  }

  /**
   * Generate trap keys for fake secrets
   */
  async generateTrapKeys(fakeSecrets, salt) {
    const trapKeys = [];

    for (const fakeSecret of fakeSecrets) {
      try {
        // Derive key from fake secret
        const fakeKey = await this.deriveEncryptionKey(fakeSecret, salt);

        // Generate decoy passkey
        const decoyKeyPair = await crypto.subtle.generateKey(
          {
            name: "ECDSA",
            namedCurve: "P-256"
          },
          true,
          ["sign", "verify"]
        );

        // Export public key for storage
        const publicKeyRaw = await crypto.subtle.exportKey("raw", decoyKeyPair.publicKey);

        trapKeys.push({
          publicKey: new Uint8Array(publicKeyRaw),
          privateKey: decoyKeyPair.privateKey,
          fakeSecret: fakeSecret
        });
      } catch (error) {
        console.error('Failed to generate trap key:', error);
      }
    }

    return trapKeys;
  }

  /**
   * Detect breach by checking if used key is a trap key
   */
  async detectBreach(usedPublicKey, realPublicKeys, trapPublicKeys) {
    try {
      // Check if key is in trap set
      const isTrap = await this.isKeyInSet(usedPublicKey, trapPublicKeys);
      if (isTrap) {
        return {
          breach: true,
          reason: "Trap key used - attacker has cloud data",
          severity: "CRITICAL"
        };
      }

      // Check if key is in real set
      const isGenuine = await this.isKeyInSet(usedPublicKey, realPublicKeys);
      if (isGenuine) {
        return {
          breach: false,
          reason: "Genuine user authentication"
        };
      }

      return {
        breach: false,
        reason: "Unknown key - authentication failed"
      };
    } catch (error) {
      return {
        breach: false,
        reason: `Breach detection error: ${error.message}`
      };
    }
  }

  /**
   * Check if a public key exists in a set of keys
   */
  async isKeyInSet(targetKey, keySet) {
    for (const key of keySet) {
      if (this.compareKeys(targetKey, key)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Compare two keys for equality
   */
  compareKeys(key1, key2) {
    if (key1.length !== key2.length) {
      return false;
    }
    
    for (let i = 0; i < key1.length; i++) {
      if (key1[i] !== key2[i]) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Secure memory clearing
   */
  secureClear(array) {
    if (array instanceof Uint8Array) {
      crypto.getRandomValues(array); // Overwrite with random
      array.fill(0); // Then zero out
    }
  }

  /**
   * Convert Uint8Array to base64 for storage
   */
  arrayToBase64(array) {
    return btoa(String.fromCharCode.apply(null, array));
  }

  /**
   * Convert base64 to Uint8Array
   */
  base64ToArray(base64) {
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return array;
  }

  /**
   * Generate strong random password
   */
  generatePassword(length = 16, includeSymbols = true) {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    let charset = lowercase + uppercase + numbers;
    if (includeSymbols) {
      charset += symbols;
    }
    
    const password = new Array(length);
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    
    for (let i = 0; i < length; i++) {
      password[i] = charset[randomValues[i] % charset.length];
    }
    
    return password.join('');
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CasperCrypto;
} else if (typeof window !== 'undefined') {
  window.CasperCrypto = CasperCrypto;
}