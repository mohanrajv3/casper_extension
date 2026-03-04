const CASPER_INFO = new TextEncoder().encode('CASPER-vault-key-v2');

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    output.set(arr, offset);
    offset += arr.length;
  }
  return output;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(input) {
  const binary = atob(input);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export class CasperCore {
  constructor() {
    this.DETECTION_SECRETS_COUNT = 5;
    this.SECRET_SIZE = 32;
    this.SALT_SIZE = 32;
    this.SELECTOR_SALT_SIZE = 16;
    this.IV_SIZE = 12;
  }

  generateDetectionSecrets(k = this.DETECTION_SECRETS_COUNT) {
    const secrets = [];
    for (let i = 0; i < k; i++) {
      const secret = new Uint8Array(this.SECRET_SIZE);
      crypto.getRandomValues(secret);
      secrets.push(secret);
    }
    return secrets;
  }

  generateSalt() {
    const salt = new Uint8Array(this.SALT_SIZE);
    crypto.getRandomValues(salt);
    return salt;
  }

  generateSelectorSalt() {
    const salt = new Uint8Array(this.SELECTOR_SALT_SIZE);
    crypto.getRandomValues(salt);
    return salt;
  }

  async selectSecretIndex(secrets, pin, selectorSalt) {
    if (!secrets?.length) throw new Error('No detection secrets available');
    const pinBytes = new TextEncoder().encode(String(pin));
    const digest = await crypto.subtle.digest('SHA-256', concatBytes(pinBytes, selectorSalt));
    const digestBytes = new Uint8Array(digest);
    const value = (digestBytes[0] << 8) | digestBytes[1];
    return value % secrets.length;
  }

  async selectSecret(secrets, pin, selectorSalt) {
    const index = await this.selectSecretIndex(secrets, pin, selectorSalt);
    return { secret: secrets[index], index };
  }

  async deriveEncryptionKey(pin, selectedSecret, salt) {
    const pinBytes = new TextEncoder().encode(String(pin));

    const pinKeyMaterial = await crypto.subtle.importKey(
      'raw',
      pinBytes,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const bindingBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: concatBytes(salt, selectedSecret),
        iterations: 210000,
      },
      pinKeyMaterial,
      256
    );

    const bindingSalt = new Uint8Array(bindingBits);
    const secretKeyMaterial = await crypto.subtle.importKey(
      'raw',
      selectedSecret,
      'HKDF',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: bindingSalt,
        info: concatBytes(CASPER_INFO, salt),
      },
      secretKeyMaterial,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encryptJson(payload, encryptionKey) {
    const iv = new Uint8Array(this.IV_SIZE);
    crypto.getRandomValues(iv);

    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encryptionKey, plaintext);
    const encrypted = new Uint8Array(cipherBuf);

    return concatBytes(iv, encrypted);
  }

  async decryptJson(encryptedData, encryptionKey) {
    if (!encryptedData?.length || encryptedData.length <= this.IV_SIZE) {
      throw new Error('Encrypted data is invalid');
    }

    const iv = encryptedData.slice(0, this.IV_SIZE);
    const cipher = encryptedData.slice(this.IV_SIZE);

    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, encryptionKey, cipher);
    const text = new TextDecoder().decode(plainBuf);
    return JSON.parse(text);
  }

  async generateTrapPublicKeys(count) {
    const trapPublicKeys = [];
    for (let i = 0; i < count; i++) {
      const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      );
      const exported = await crypto.subtle.exportKey('raw', keyPair.publicKey);
      trapPublicKeys.push(new Uint8Array(exported));
    }
    return trapPublicKeys;
  }

  isTrapPublicKey(publicKeyB64, trapPublicKeysB64) {
    return trapPublicKeysB64.includes(publicKeyB64);
  }

  generatePassword(length = 20, includeSymbols = true) {
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{};:,.?';

    let set = lower + upper + numbers;
    if (includeSymbols) set += symbols;

    const output = [];
    const rand = new Uint8Array(length);
    crypto.getRandomValues(rand);
    for (let i = 0; i < length; i++) output.push(set[rand[i] % set.length]);
    return output.join('');
  }

  normalizeBase32(input) {
    return input.replace(/\s+/g, '').replace(/=+$/g, '').toUpperCase();
  }

  base32ToBytes(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const normalized = this.normalizeBase32(input);
    let bits = '';

    for (const ch of normalized) {
      const idx = alphabet.indexOf(ch);
      if (idx === -1) throw new Error('Invalid Base32 secret');
      bits += idx.toString(2).padStart(5, '0');
    }

    const out = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      out.push(parseInt(bits.slice(i, i + 8), 2));
    }

    return new Uint8Array(out);
  }

  parseOtpAuthUri(uri) {
    if (!uri?.startsWith('otpauth://')) throw new Error('Invalid otpauth URI');
    const parsed = new URL(uri);
    const type = parsed.hostname.toLowerCase();
    if (!['totp', 'hotp'].includes(type)) throw new Error('Unsupported OTP type');

    const rawLabel = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    const issuerFromLabel = rawLabel.includes(':') ? rawLabel.split(':')[0] : '';
    const accountLabel = rawLabel.includes(':') ? rawLabel.split(':').slice(1).join(':') : rawLabel;

    const secret = parsed.searchParams.get('secret');
    if (!secret) throw new Error('otpauth URI missing secret');

    const issuer = parsed.searchParams.get('issuer') || issuerFromLabel || 'Unknown';
    const algorithm = (parsed.searchParams.get('algorithm') || 'SHA1').toUpperCase();
    const digits = Number(parsed.searchParams.get('digits') || 6);
    const period = Number(parsed.searchParams.get('period') || 30);
    const counter = Number(parsed.searchParams.get('counter') || 0);

    return {
      type,
      issuer,
      label: accountLabel || 'Account',
      secret: this.normalizeBase32(secret),
      algorithm,
      digits,
      period,
      counter,
    };
  }

  async generateOtpCode(account, atMs = Date.now()) {
    const secretBytes = this.base32ToBytes(account.secret);
    const algorithm = (account.algorithm || 'SHA1').toUpperCase();
    const hash = algorithm === 'SHA256' ? 'SHA-256' : algorithm === 'SHA512' ? 'SHA-512' : 'SHA-1';

    let counter = 0;
    let remaining = 0;

    if (account.type === 'hotp') {
      counter = Number(account.counter || 0);
      remaining = -1;
    } else {
      const step = Number(account.period || 30);
      const epochSec = Math.floor(atMs / 1000);
      counter = Math.floor(epochSec / step);
      remaining = step - (epochSec % step);
    }

    const msg = new Uint8Array(8);
    let temp = counter;
    for (let i = 7; i >= 0; i--) {
      msg[i] = temp & 0xff;
      temp = Math.floor(temp / 256);
    }

    const hmacKey = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash },
      false,
      ['sign']
    );

    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, msg));
    const offset = signature[signature.length - 1] & 0x0f;
    const binary =
      ((signature[offset] & 0x7f) << 24) |
      ((signature[offset + 1] & 0xff) << 16) |
      ((signature[offset + 2] & 0xff) << 8) |
      (signature[offset + 3] & 0xff);

    const digits = Number(account.digits || 6);
    const code = (binary % 10 ** digits).toString().padStart(digits, '0');

    return { code, counter, remaining };
  }

  bytesToBase64(bytes) {
    return bytesToBase64(bytes);
  }

  base64ToBytes(value) {
    return base64ToBytes(value);
  }
}
