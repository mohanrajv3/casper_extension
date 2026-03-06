/**
 * CASPER Safari Extension Background Script
 * Handles vault management, messaging, and breach detection for Safari
 */

// Safari compatibility layer
const browser = chrome || safari?.extension || {
  runtime: {
    sendMessage: (message, callback) => {
      if (safari?.extension?.dispatchMessage) {
        safari.extension.dispatchMessage('message', message);
      }
      if (callback) callback({});
    },
    onMessage: {
      addListener: (callback) => {
        if (safari?.extension?.addEventListener) {
          safari.extension.addEventListener('message', (event) => {
            callback(event.message, {}, () => {});
          });
        }
      }
    }
  },
  storage: {
    local: {
      set: (data) => {
        return new Promise((resolve) => {
          Object.keys(data).forEach(key => {
            localStorage.setItem(`casper_${key}`, JSON.stringify(data[key]));
          });
          resolve();
        });
      },
      get: (keys) => {
        return new Promise((resolve) => {
          const result = {};
          if (Array.isArray(keys)) {
            keys.forEach(key => {
              const value = localStorage.getItem(`casper_${key}`);
              if (value) {
                try {
                  result[key] = JSON.parse(value);
                } catch (e) {
                  result[key] = value;
                }
              }
            });
          }
          resolve(result);
        });
      }
    },
    sync: {
      set: function(data) { return this.local?.set(data); },
      get: function(keys) { return this.local?.get(keys); }
    }
  },
  tabs: {
    query: (queryInfo) => {
      return new Promise((resolve) => {
        // Safari fallback - return mock active tab
        resolve([{ id: 1, url: window.location?.href || 'about:blank', title: 'Active Tab' }]);
      });
    }
  }
};

class CasperSafariBackground {
  constructor() {
    this.vault = new VaultCrypto();
    this.breachDetector = new SafariBreachDetector();
    this.setupMessageHandlers();
    this.setupSafariSpecificHandlers();
  }

  /**
   * Set up message handlers for Safari
   */
  setupMessageHandlers() {
    // Handle Chrome-style messages
    if (browser.runtime?.onMessage) {
      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true;
      });
    }
    
    // Handle Safari-specific messages
    if (safari?.extension?.addEventListener) {
      safari.extension.addEventListener('message', (event) => {
        this.handleSafariMessage(event);
      });
    }
  }

  /**
   * Handle Safari-specific setup
   */
  setupSafariSpecificHandlers() {
    // Safari extension global page setup
    if (typeof safari !== 'undefined' && safari.extension) {
      console.log('CASPER Safari Extension loaded');
    }
  }

  /**
   * Handle Safari message format
   */
  handleSafariMessage(event) {
    const message = event.message;
    const mockSender = { tab: { id: 1, url: 'safari://current-tab' } };
    
    this.handleMessage(message, mockSender, (response) => {
      // Send response back to Safari content script
      if (safari?.extension?.dispatchMessage) {
        safari.extension.dispatchMessage('response', {
          id: message.id,
          response: response
        });
      }
    });
  }

  /**
   * Handle messages from popup and content scripts
   */
  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'VAULT_STATUS':
          sendResponse(await this.getVaultStatus());
          break;

        case 'INITIALIZE_VAULT':
          sendResponse(await this.initializeVault(message.pin));
          break;

        case 'UNLOCK_VAULT':
          sendResponse(await this.unlockVault(message.pin));
          break;

        case 'LOCK_VAULT':
          sendResponse(this.lockVault());
          break;

        case 'ADD_PASSWORD':
          sendResponse(await this.addPassword(message.entry));
          break;

        case 'GET_PASSWORDS':
          sendResponse(await this.getPasswordsForUrl(message.url));
          break;

        case 'GET_ALL_PASSWORDS':
          sendResponse(await this.getAllPasswords());
          break;

        case 'UPDATE_PASSWORD':
          sendResponse(await this.updatePassword(message.id, message.updates));
          break;

        case 'DELETE_PASSWORD':
          sendResponse(await this.deletePassword(message.id));
          break;

        case 'GENERATE_PASSWORD':
          sendResponse(this.generatePassword(message.options));
          break;

        case 'AUTOFILL_REQUEST':
          sendResponse(await this.handleAutofillRequest(message.url, sender.tab));
          break;

        case 'SAVE_CREDENTIALS':
          sendResponse(await this.saveCredentials(message.credentials, sender.tab));
          break;

        case 'CHECK_BREACH':
          sendResponse(await this.checkBreach(message.publicKey));
          break;

        default:
          sendResponse({ success: false, message: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Safari background message handler error:', error);
      sendResponse({ success: false, message: error.message });
    }
  }

  /**
   * Get vault status
   */
  async getVaultStatus() {
    const exists = await this.vault.vaultExists();
    const status = this.vault.getStatus();
    
    return {
      success: true,
      vaultExists: exists,
      isUnlocked: status.isUnlocked,
      entryCount: status.entryCount
    };
  }

  /**
   * Initialize new vault
   */
  async initializeVault(pin) {
    if (!pin || pin.length < 4) {
      return { success: false, message: 'PIN must be at least 4 digits' };
    }

    return await this.vault.initializeVault(pin);
  }

  /**
   * Unlock vault with PIN
   */
  async unlockVault(pin) {
    return await this.vault.unlockVault(pin);
  }

  /**
   * Lock vault
   */
  lockVault() {
    return this.vault.lockVault();
  }

  /**
   * Add password to vault
   */
  async addPassword(entry) {
    try {
      const result = await this.vault.addPassword(entry);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Get passwords for URL
   */
  async getPasswordsForUrl(url) {
    try {
      const passwords = this.vault.getPasswordsForUrl(url);
      return { success: true, data: passwords };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Get all passwords
   */
  async getAllPasswords() {
    try {
      if (!this.vault.isUnlocked) {
        return { success: false, message: 'Vault is locked' };
      }
      
      const passwords = this.vault.vaultData?.passwords || [];
      return { success: true, data: passwords };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Update password entry
   */
  async updatePassword(id, updates) {
    try {
      const result = await this.vault.updatePassword(id, updates);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Delete password entry
   */
  async deletePassword(id) {
    try {
      await this.vault.deletePassword(id);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Generate strong password
   */
  generatePassword(options = {}) {
    const casper = new CasperCrypto();
    const password = casper.generatePassword(
      options.length || 16,
      options.includeSymbols !== false
    );
    
    return { success: true, password };
  }

  /**
   * Handle autofill request from content script
   */
  async handleAutofillRequest(url, tab) {
    try {
      if (!this.vault.isUnlocked) {
        return { 
          success: false, 
          message: 'Vault is locked',
          requiresUnlock: true 
        };
      }

      const passwords = this.vault.getPasswordsForUrl(url);
      
      if (passwords.length === 0) {
        return { 
          success: false, 
          message: 'No credentials found for this site' 
        };
      }

      const credential = passwords[0];
      
      // Update last used timestamp
      await this.vault.updatePassword(credential.id, { 
        lastUsed: Date.now() 
      });

      return {
        success: true,
        credential: {
          username: credential.username,
          password: credential.password
        }
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Save credentials from page
   */
  async saveCredentials(credentials, tab) {
    try {
      const entry = {
        url: tab.url,
        username: credentials.username,
        password: credentials.password,
        title: tab.title
      };

      const result = await this.vault.addPassword(entry);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Check for breach using CASPER algorithm
   */
  async checkBreach(publicKey) {
    return await this.breachDetector.checkBreach(publicKey);
  }
}

/**
 * Safari-compatible Breach Detection System
 */
class SafariBreachDetector {
  constructor() {
    this.casper = new CasperCrypto();
  }

  /**
   * Check if a public key indicates a breach
   */
  async checkBreach(publicKey) {
    try {
      const vault = new VaultCrypto();
      const cloudData = await vault.fetchCloudData();
      
      if (!cloudData) {
        return { success: false, message: 'No vault data found' };
      }

      const trapKeys = cloudData.casper.trapPublicKeys.map(key => 
        this.casper.base64ToArray(key)
      );

      const isTrap = await this.casper.isKeyInSet(publicKey, trapKeys);
      
      if (isTrap) {
        await this.handleBreachDetection(cloudData);
        
        return {
          success: true,
          breach: true,
          message: 'BREACH DETECTED: Trap key used',
          severity: 'CRITICAL'
        };
      }

      return {
        success: true,
        breach: false,
        message: 'No breach detected'
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Breach detection error: ${error.message}` 
      };
    }
  }

  /**
   * Handle breach detection for Safari
   */
  async handleBreachDetection(cloudData) {
    const breachEvent = {
      timestamp: Date.now(),
      type: 'TRAP_KEY_USED',
      severity: 'CRITICAL',
      description: 'Attacker used trap key - cloud storage compromised'
    };

    cloudData.security.breachAlerts.push(breachEvent);
    
    const vault = new VaultCrypto();
    await vault.storeCloudData(cloudData);

    // Safari notification (if available)
    if (Notification && Notification.permission === 'granted') {
      new Notification('CASPER Security Alert', {
        body: 'BREACH DETECTED! Your cloud storage may be compromised.',
        icon: 'icons/icon-48.png'
      });
    }

    console.warn('CASPER BREACH DETECTED:', breachEvent);
  }
}

// Initialize Safari background
const casperSafariBackground = new CasperSafariBackground();

// Safari extension lifecycle
if (typeof safari !== 'undefined') {
  console.log('CASPER Safari Extension background loaded');
} else {
  console.log('CASPER Extension background loaded (Chrome compatibility mode)');
}