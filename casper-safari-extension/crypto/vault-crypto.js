/**
 * Vault Cryptography Manager
 * Handles vault encryption, decryption, and data management
 */

class VaultCrypto {
  constructor() {
    this.casper = new CasperCrypto();
    this.isUnlocked = false;
    this.encryptionKey = null;
    this.vaultData = null;
    this.autoLockTimer = null;
    this.AUTO_LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Initialize new vault with PIN
   */
  async initializeVault(pin) {
    try {
      // Generate CASPER components
      const detectionSecrets = this.casper.generateDetectionSecrets();
      const salt = this.casper.generateSalt();
      
      // Select real secret using PIN
      const realSecret = this.casper.selectSecret(detectionSecrets, pin);
      
      // Derive encryption key
      const encryptionKey = await this.casper.deriveEncryptionKey(realSecret, salt);
      
      // Generate trap keys for fake secrets
      const fakeSecrets = detectionSecrets.filter(secret => 
        !this.casper.compareKeys(secret, realSecret)
      );
      const trapKeys = await this.casper.generateTrapKeys(fakeSecrets, salt);
      
      // Create empty vault
      const initialVault = {
        version: 1,
        created: Date.now(),
        passwords: [],
        passkeys: [],
        secureNotes: [],
        settings: {
          autoFill: true,
          autoLockMinutes: 5,
          breachAlerts: true
        }
      };
      
      // Encrypt vault
      const encryptedVault = await this.casper.encryptVault(initialVault, encryptionKey);
      
      // Prepare cloud storage data
      const cloudData = {
        userId: this.generateUserId(),
        version: 1,
        casper: {
          detectionSecrets: detectionSecrets.map(s => this.casper.arrayToBase64(s)),
          salt: this.casper.arrayToBase64(salt),
          trapPublicKeys: trapKeys.map(tk => this.casper.arrayToBase64(tk.publicKey))
        },
        vault: {
          data: this.casper.arrayToBase64(encryptedVault),
          lastModified: Date.now()
        },
        security: {
          lastAccess: Date.now(),
          accessCount: 0,
          breachAlerts: []
        }
      };
      
      // Store in cloud (simulated with local storage for now)
      await this.storeCloudData(cloudData);
      
      // Set up session
      this.encryptionKey = encryptionKey;
      this.vaultData = initialVault;
      this.isUnlocked = true;
      this.startAutoLock();
      
      return {
        success: true,
        message: 'Vault initialized successfully'
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Vault initialization failed: ${error.message}`
      };
    }
  }

  /**
   * Unlock vault with PIN
   */
  async unlockVault(pin) {
    try {
      console.log('Attempting to unlock vault with PIN:', pin);
      
      // Fetch cloud data
      const cloudData = await this.fetchCloudData();
      if (!cloudData) {
        throw new Error('No vault found');
      }
      
      console.log('Cloud data found, processing secrets...');
      
      // Convert detection secrets from base64
      const detectionSecrets = cloudData.casper.detectionSecrets.map(s => 
        this.casper.base64ToArray(s)
      );
      const salt = this.casper.base64ToArray(cloudData.casper.salt);
      
      console.log(`Found ${detectionSecrets.length} detection secrets`);
      
      // Select real secret using PIN
      const realSecret = this.casper.selectSecret(detectionSecrets, pin);
      console.log('Selected real secret for decryption');
      
      // Derive encryption key
      const encryptionKey = await this.casper.deriveEncryptionKey(realSecret, salt);
      console.log('Derived encryption key');
      
      // Decrypt vault
      const encryptedVault = this.casper.base64ToArray(cloudData.vault.data);
      console.log('Attempting to decrypt vault data...');
      
      const vaultData = await this.casper.decryptVault(encryptedVault, encryptionKey);
      console.log('Vault decrypted successfully');
      
      // Set up session
      this.encryptionKey = encryptionKey;
      this.vaultData = vaultData;
      this.isUnlocked = true;
      this.startAutoLock();
      
      // Update access tracking
      await this.updateAccessTracking();
      
      return {
        success: true,
        message: 'Vault unlocked successfully',
        data: vaultData
      };
      
    } catch (error) {
      console.error('Unlock error details:', error);
      return {
        success: false,
        message: `Unlock failed: ${error.message}`
      };
    }
  }

  /**
   * Lock vault and clear sensitive data
   */
  lockVault() {
    // Clear sensitive data from memory
    if (this.encryptionKey) {
      this.encryptionKey = null;
    }
    
    this.vaultData = null;
    this.isUnlocked = false;
    
    // Clear auto-lock timer
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
    
    return {
      success: true,
      message: 'Vault locked'
    };
  }

  /**
   * Add password entry to vault
   */
  async addPassword(entry) {
    if (!this.isUnlocked) {
      throw new Error('Vault is locked');
    }
    
    const passwordEntry = {
      id: this.generateEntryId(),
      url: entry.url,
      username: entry.username,
      password: entry.password,
      title: entry.title || this.extractDomain(entry.url),
      created: Date.now(),
      lastUsed: null,
      notes: entry.notes || ''
    };
    
    this.vaultData.passwords.push(passwordEntry);
    await this.saveVault();
    
    return passwordEntry;
  }

  /**
   * Get passwords for a specific URL
   */
  getPasswordsForUrl(url) {
    if (!this.isUnlocked) {
      return [];
    }
    
    const domain = this.extractDomain(url);
    return this.vaultData.passwords.filter(entry => 
      this.extractDomain(entry.url) === domain
    );
  }

  /**
   * Update password entry
   */
  async updatePassword(id, updates) {
    if (!this.isUnlocked) {
      throw new Error('Vault is locked');
    }
    
    const index = this.vaultData.passwords.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error('Password entry not found');
    }
    
    this.vaultData.passwords[index] = {
      ...this.vaultData.passwords[index],
      ...updates,
      modified: Date.now()
    };
    
    await this.saveVault();
    return this.vaultData.passwords[index];
  }

  /**
   * Delete password entry
   */
  async deletePassword(id) {
    if (!this.isUnlocked) {
      throw new Error('Vault is locked');
    }
    
    const index = this.vaultData.passwords.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error('Password entry not found');
    }
    
    this.vaultData.passwords.splice(index, 1);
    await this.saveVault();
    
    return { success: true };
  }

  /**
   * Save vault to cloud storage
   */
  async saveVault() {
    if (!this.isUnlocked || !this.encryptionKey) {
      throw new Error('Cannot save locked vault');
    }
    
    try {
      // Encrypt updated vault
      const encryptedVault = await this.casper.encryptVault(this.vaultData, this.encryptionKey);
      
      // Update cloud data
      const cloudData = await this.fetchCloudData();
      cloudData.vault.data = this.casper.arrayToBase64(encryptedVault);
      cloudData.vault.lastModified = Date.now();
      
      await this.storeCloudData(cloudData);
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to save vault: ${error.message}`);
    }
  }

  /**
   * Start auto-lock timer
   */
  startAutoLock() {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
    }
    
    this.autoLockTimer = setTimeout(() => {
      this.lockVault();
    }, this.AUTO_LOCK_TIMEOUT);
  }

  /**
   * Reset auto-lock timer (called on user activity)
   */
  resetAutoLock() {
    if (this.isUnlocked) {
      this.startAutoLock();
    }
  }

  /**
   * Generate unique user ID
   */
  generateUserId() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate unique entry ID
   */
  generateEntryId() {
    const array = new Uint8Array(8);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  }

  /**
   * Store data in cloud (simulated with chrome.storage.sync)
   */
  async storeCloudData(data) {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.sync.set({ casperVault: data });
    } else {
      // Fallback for testing - use consistent key
      localStorage.setItem('casper_local_vault', JSON.stringify(data));
    }
  }

  /**
   * Fetch data from cloud
   */
  async fetchCloudData() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.sync.get(['casperVault']);
      return result.casperVault;
    } else {
      // Fallback for testing - use consistent key
      const data = localStorage.getItem('casper_local_vault');
      return data ? JSON.parse(data) : null;
    }
  }

  /**
   * Update access tracking for security monitoring
   */
  async updateAccessTracking() {
    try {
      const cloudData = await this.fetchCloudData();
      if (cloudData) {
        cloudData.security.lastAccess = Date.now();
        cloudData.security.accessCount++;
        await this.storeCloudData(cloudData);
      }
    } catch (error) {
      console.error('Failed to update access tracking:', error);
    }
  }

  /**
   * Check if vault exists
   */
  async vaultExists() {
    const cloudData = await this.fetchCloudData();
    return cloudData !== null;
  }

  /**
   * Get vault status
   */
  getStatus() {
    return {
      isUnlocked: this.isUnlocked,
      hasVault: this.vaultData !== null,
      entryCount: this.vaultData ? this.vaultData.passwords.length : 0
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VaultCrypto;
} else if (typeof window !== 'undefined') {
  window.VaultCrypto = VaultCrypto;
}