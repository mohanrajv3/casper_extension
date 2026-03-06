/**
 * CASPER Safari Popup Interface
 * Safari-compatible version of popup functionality
 */

// Safari compatibility layer
const safariCompat = {
  sendMessage: (message, callback) => {
    if (typeof safari !== 'undefined' && safari.extension) {
      const messageId = Date.now() + Math.random();
      message.id = messageId;
      
      safari.extension.dispatchMessage('message', message);
      
      const responseHandler = (event) => {
        if (event.message.id === messageId) {
          safari.extension.removeEventListener('message', responseHandler);
          if (callback) callback(event.message.response);
        }
      };
      
      safari.extension.addEventListener('message', responseHandler);
    } else if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage(message, callback);
    } else {
      console.warn('No messaging API available');
      if (callback) callback({ success: false, message: 'No messaging API' });
    }
  },
  
  getCurrentTab: () => {
    return new Promise((resolve) => {
      if (typeof safari !== 'undefined' && safari.extension) {
        // Safari doesn't have direct tab access from popup
        resolve({ id: 1, url: 'safari://current-tab', title: 'Current Tab' });
      } else if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          resolve(tabs[0] || { id: 1, url: 'about:blank', title: 'Unknown' });
        });
      } else {
        resolve({ id: 1, url: 'about:blank', title: 'Unknown' });
      }
    });
  }
};

class CasperSafariPopup {
  constructor() {
    this.currentScreen = 'loading';
    this.vaultStatus = null;
    this.currentTab = null;
    
    this.init();
  }

  /**
   * Initialize popup
   */
  async init() {
    await this.getCurrentTab();
    await this.checkVaultStatus();
    this.setupEventListeners();
    this.showAppropriateScreen();
  }

  /**
   * Get current active tab
   */
  async getCurrentTab() {
    try {
      this.currentTab = await safariCompat.getCurrentTab();
    } catch (error) {
      console.error('Failed to get current tab:', error);
      this.currentTab = { id: 1, url: 'about:blank', title: 'Unknown' };
    }
  }

  /**
   * Check vault status from background
   */
  async checkVaultStatus() {
    try {
      safariCompat.sendMessage({ type: 'VAULT_STATUS' }, (response) => {
        this.vaultStatus = response;
        this.updateStatusDisplay();
        this.updateEntryCount();
      });
    } catch (error) {
      console.error('Failed to check vault status:', error);
    }
  }

  /**
   * Show appropriate screen based on vault status
   */
  showAppropriateScreen() {
    this.hideAllScreens();
    
    if (!this.vaultStatus) {
      this.showScreen('setupScreen');
    } else if (!this.vaultStatus.vaultExists) {
      this.showScreen('setupScreen');
    } else if (!this.vaultStatus.isUnlocked) {
      this.showScreen('unlockScreen');
    } else {
      this.showScreen('mainScreen');
      this.loadRecentPasswords();
    }
  }

  /**
   * Hide all screens
   */
  hideAllScreens() {
    const screens = ['setupScreen', 'unlockScreen', 'mainScreen', 'addPasswordScreen'];
    screens.forEach(screenId => {
      const screen = document.getElementById(screenId);
      if (screen) screen.style.display = 'none';
    });
  }

  /**
   * Show specific screen
   */
  showScreen(screenId) {
    this.hideAllScreens();
    const screen = document.getElementById(screenId);
    if (screen) {
      screen.style.display = 'block';
      this.currentScreen = screenId;
    }
  }

  /**
   * Update status display in header
   */
  updateStatusDisplay() {
    const lockIcon = document.getElementById('lockIcon');
    const statusText = document.getElementById('statusText');
    
    if (this.vaultStatus && this.vaultStatus.isUnlocked) {
      if (lockIcon) lockIcon.textContent = '🔓';
      if (statusText) statusText.textContent = 'Unlocked';
    } else {
      if (lockIcon) lockIcon.textContent = '🔒';
      if (statusText) statusText.textContent = 'Locked';
    }
  }

  /**
   * Update entry count display
   */
  updateEntryCount() {
    const entryCount = document.getElementById('entryCount');
    if (entryCount && this.vaultStatus) {
      entryCount.textContent = this.vaultStatus.entryCount || 0;
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Setup screen
    const createVaultBtn = document.getElementById('createVaultBtn');
    if (createVaultBtn) {
      createVaultBtn.addEventListener('click', () => this.createVault());
    }
    
    // Unlock screen
    const unlockBtn = document.getElementById('unlockBtn');
    if (unlockBtn) {
      unlockBtn.addEventListener('click', () => this.unlockVault());
    }
    
    const pinInput = document.getElementById('pinInput');
    if (pinInput) {
      pinInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.unlockVault();
      });
    }
    
    // Main screen actions
    const autofillBtn = document.getElementById('autofillBtn');
    if (autofillBtn) {
      autofillBtn.addEventListener('click', () => this.autofill());
    }
    
    const addPasswordBtn = document.getElementById('addPasswordBtn');
    if (addPasswordBtn) {
      addPasswordBtn.addEventListener('click', () => this.showAddPassword());
    }
    
    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => this.generatePassword());
    }
    
    const vaultBtn = document.getElementById('vaultBtn');
    if (vaultBtn) {
      vaultBtn.addEventListener('click', () => this.openVault());
    }
    
    const lockBtn = document.getElementById('lockBtn');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => this.lockVault());
    }
    
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.openSettings());
    }
    
    // Add password screen
    const backFromAdd = document.getElementById('backFromAdd');
    if (backFromAdd) {
      backFromAdd.addEventListener('click', () => this.showScreen('mainScreen'));
    }
    
    const savePasswordBtn = document.getElementById('savePasswordBtn');
    if (savePasswordBtn) {
      savePasswordBtn.addEventListener('click', () => this.savePassword());
    }
    
    const generatePasswordBtn = document.getElementById('generatePasswordBtn');
    if (generatePasswordBtn) {
      generatePasswordBtn.addEventListener('click', () => this.generatePasswordForForm());
    }
    
    // Setup PIN inputs (numeric only)
    const pinInputs = ['setupPin', 'confirmPin', 'pinInput'];
    pinInputs.forEach(inputId => {
      const input = document.getElementById(inputId);
      if (input) {
        input.addEventListener('input', (e) => {
          e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
      }
    });
    
    // Auto-fill current site info when adding password
    const addPasswordBtnMain = document.getElementById('addPasswordBtn');
    if (addPasswordBtnMain) {
      addPasswordBtnMain.addEventListener('click', () => {
        this.prefillSiteInfo();
      });
    }
    
    // Close breach alert
    const closeAlert = document.getElementById('closeAlert');
    if (closeAlert) {
      closeAlert.addEventListener('click', () => {
        const breachAlert = document.getElementById('breachAlert');
        if (breachAlert) breachAlert.style.display = 'none';
      });
    }
  }

  /**
   * Create new vault
   */
  async createVault() {
    const setupPin = document.getElementById('setupPin');
    const confirmPin = document.getElementById('confirmPin');
    
    if (!setupPin || !confirmPin) {
      this.showError('PIN input fields not found');
      return;
    }
    
    const pin = setupPin.value;
    const confirmPinValue = confirmPin.value;
    
    if (!pin || pin.length < 4) {
      this.showError('PIN must be at least 4 digits');
      return;
    }
    
    if (pin !== confirmPinValue) {
      this.showError('PINs do not match');
      return;
    }
    
    this.showLoading(true);
    
    try {
      safariCompat.sendMessage({ 
        type: 'INITIALIZE_VAULT', 
        pin: pin 
      }, (response) => {
        this.showLoading(false);
        
        if (response && response.success) {
          this.checkVaultStatus().then(() => {
            this.showScreen('mainScreen');
            this.showSuccess('Vault created successfully!');
          });
        } else {
          this.showError(response?.message || 'Failed to create vault');
        }
      });
    } catch (error) {
      this.showLoading(false);
      this.showError('Failed to create vault: ' + error.message);
    }
  }

  /**
   * Unlock vault with PIN
   */
  async unlockVault() {
    const pinInput = document.getElementById('pinInput');
    if (!pinInput) {
      this.showError('PIN input field not found');
      return;
    }
    
    const pin = pinInput.value;
    
    if (!pin) {
      this.showError('Please enter your PIN');
      return;
    }
    
    this.showLoading(true);
    
    try {
      safariCompat.sendMessage({ 
        type: 'UNLOCK_VAULT', 
        pin: pin 
      }, (response) => {
        this.showLoading(false);
        
        if (response && response.success) {
          this.checkVaultStatus().then(() => {
            this.showScreen('mainScreen');
            this.loadRecentPasswords();
            pinInput.value = '';
          });
        } else {
          this.showError(response?.message || 'Failed to unlock vault');
        }
      });
    } catch (error) {
      this.showLoading(false);
      this.showError('Failed to unlock vault: ' + error.message);
    }
  }

  /**
   * Lock vault
   */
  async lockVault() {
    try {
      safariCompat.sendMessage({ type: 'LOCK_VAULT' }, (response) => {
        this.checkVaultStatus().then(() => {
          this.showScreen('unlockScreen');
        });
      });
    } catch (error) {
      this.showError('Failed to lock vault: ' + error.message);
    }
  }

  /**
   * Autofill current page
   */
  async autofill() {
    if (!this.currentTab) {
      this.showError('No active tab found');
      return;
    }
    
    try {
      safariCompat.sendMessage({ 
        type: 'AUTOFILL_REQUEST', 
        url: this.currentTab.url 
      }, (response) => {
        if (response && response.success) {
          this.showSuccess('Credentials filled!');
          // Safari popup closes automatically
        } else if (response && response.requiresUnlock) {
          this.showScreen('unlockScreen');
        } else {
          this.showError(response?.message || 'Autofill failed');
        }
      });
    } catch (error) {
      this.showError('Autofill failed: ' + error.message);
    }
  }

  /**
   * Show add password screen
   */
  showAddPassword() {
    this.showScreen('addPasswordScreen');
    this.prefillSiteInfo();
  }

  /**
   * Prefill site information
   */
  prefillSiteInfo() {
    if (this.currentTab) {
      const siteUrl = document.getElementById('siteUrl');
      const title = document.getElementById('title');
      
      if (siteUrl) siteUrl.value = this.currentTab.url;
      if (title) title.value = this.currentTab.title;
    }
  }

  /**
   * Save password
   */
  async savePassword() {
    const siteUrl = document.getElementById('siteUrl');
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    const title = document.getElementById('title');
    
    if (!siteUrl || !username || !password) {
      this.showError('Required form fields not found');
      return;
    }
    
    const url = siteUrl.value;
    const usernameValue = username.value;
    const passwordValue = password.value;
    const titleValue = title ? title.value : '';
    
    if (!url || !usernameValue || !passwordValue) {
      this.showError('Please fill in all required fields');
      return;
    }
    
    this.showLoading(true);
    
    try {
      safariCompat.sendMessage({
        type: 'ADD_PASSWORD',
        entry: { 
          url: url, 
          username: usernameValue, 
          password: passwordValue, 
          title: titleValue 
        }
      }, (response) => {
        this.showLoading(false);
        
        if (response && response.success) {
          this.showScreen('mainScreen');
          this.loadRecentPasswords();
          this.showSuccess('Password saved!');
          
          // Clear form
          siteUrl.value = '';
          username.value = '';
          password.value = '';
          if (title) title.value = '';
        } else {
          this.showError(response?.message || 'Failed to save password');
        }
      });
    } catch (error) {
      this.showLoading(false);
      this.showError('Failed to save password: ' + error.message);
    }
  }

  /**
   * Generate password
   */
  async generatePassword() {
    try {
      safariCompat.sendMessage({ 
        type: 'GENERATE_PASSWORD',
        options: { length: 16, includeSymbols: true }
      }, async (response) => {
        if (response && response.success) {
          try {
            await navigator.clipboard.writeText(response.password);
            this.showSuccess('Password generated and copied to clipboard!');
          } catch (clipboardError) {
            this.showSuccess(`Password generated: ${response.password}`);
          }
        } else {
          this.showError('Failed to generate password');
        }
      });
    } catch (error) {
      this.showError('Failed to generate password: ' + error.message);
    }
  }

  /**
   * Generate password for form
   */
  async generatePasswordForForm() {
    try {
      safariCompat.sendMessage({ 
        type: 'GENERATE_PASSWORD',
        options: { length: 16, includeSymbols: true }
      }, (response) => {
        if (response && response.success) {
          const passwordField = document.getElementById('password');
          if (passwordField) {
            passwordField.value = response.password;
          }
        } else {
          this.showError('Failed to generate password');
        }
      });
    } catch (error) {
      this.showError('Failed to generate password: ' + error.message);
    }
  }

  /**
   * Load recent passwords
   */
  async loadRecentPasswords() {
    if (!this.currentTab) return;
    
    try {
      safariCompat.sendMessage({ 
        type: 'GET_PASSWORDS', 
        url: this.currentTab.url 
      }, (response) => {
        if (response && response.success) {
          this.displayPasswords(response.data);
        }
      });
    } catch (error) {
      console.error('Failed to load passwords:', error);
    }
  }

  /**
   * Display passwords in list
   */
  displayPasswords(passwords) {
    const passwordList = document.getElementById('passwordList');
    if (!passwordList) return;
    
    if (passwords.length === 0) {
      passwordList.innerHTML = '<p style="text-align: center; color: #64748b; padding: 20px;">No passwords for this site</p>';
      return;
    }
    
    passwordList.innerHTML = passwords.map(password => `
      <div class="password-item" data-id="${password.id}">
        <div class="password-favicon">🌐</div>
        <div class="password-info">
          <div class="password-title">${this.escapeHtml(password.title)}</div>
          <div class="password-username">${this.escapeHtml(password.username)}</div>
        </div>
        <div class="password-actions">
          <button class="icon-btn copy-btn" data-password="${this.escapeHtml(password.password)}">📋</button>
          <button class="icon-btn fill-btn" data-id="${password.id}">🔑</button>
        </div>
      </div>
    `).join('');
    
    // Add event listeners for password actions
    passwordList.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.copyPassword(btn.dataset.password);
      });
    });
    
    passwordList.querySelectorAll('.fill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.fillPassword(btn.dataset.id);
      });
    });
  }

  /**
   * Copy password to clipboard
   */
  async copyPassword(password) {
    try {
      await navigator.clipboard.writeText(password);
      this.showSuccess('Password copied to clipboard!');
    } catch (error) {
      this.showError('Failed to copy password');
    }
  }

  /**
   * Fill specific password
   */
  async fillPassword(passwordId) {
    await this.autofill();
  }

  /**
   * Open full vault interface
   */
  openVault() {
    // Safari extension can't open new tabs directly
    // Show message to user
    this.showError('Please open Safari and navigate to the CASPER vault page');
  }

  /**
   * Open settings
   */
  openSettings() {
    this.showError('Settings not implemented yet');
  }

  /**
   * Show loading overlay
   */
  showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.style.display = show ? 'flex' : 'none';
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
      
      setTimeout(() => {
        errorElement.style.display = 'none';
      }, 5000);
    } else {
      console.error('Error:', message);
    }
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    successDiv.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #10b981;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 1000;
    `;
    
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
      successDiv.remove();
    }, 3000);
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize Safari popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new CasperSafariPopup();
});