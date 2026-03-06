/**
 * CASPER Popup Interface
 * Handles user interactions and vault management
 */

class CasperPopup {
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
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tab;
    } catch (error) {
      console.error('Failed to get current tab:', error);
    }
  }

  /**
   * Check vault status from background
   */
  async checkVaultStatus() {
    try {
      const response = await this.sendMessage({ type: 'VAULT_STATUS' });
      this.vaultStatus = response;
      
      // Update UI elements
      this.updateStatusDisplay();
      this.updateEntryCount();
    } catch (error) {
      console.error('Failed to check vault status:', error);
    }
  }

  /**
   * Send message to background script
   */
  sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
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
      lockIcon.textContent = '🔓';
      statusText.textContent = 'Unlocked';
    } else {
      lockIcon.textContent = '🔒';
      statusText.textContent = 'Locked';
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
    document.getElementById('createVaultBtn')?.addEventListener('click', () => this.createVault());
    
    // Unlock screen
    document.getElementById('unlockBtn')?.addEventListener('click', () => this.unlockVault());
    document.getElementById('pinInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.unlockVault();
    });
    
    // Main screen actions
    document.getElementById('autofillBtn')?.addEventListener('click', () => this.autofill());
    document.getElementById('addPasswordBtn')?.addEventListener('click', () => this.showAddPassword());
    document.getElementById('generateBtn')?.addEventListener('click', () => this.generatePassword());
    document.getElementById('vaultBtn')?.addEventListener('click', () => this.openVault());
    document.getElementById('lockBtn')?.addEventListener('click', () => this.lockVault());
    document.getElementById('settingsBtn')?.addEventListener('click', () => this.openSettings());
    
    // Add password screen
    document.getElementById('backFromAdd')?.addEventListener('click', () => this.showScreen('mainScreen'));
    document.getElementById('savePasswordBtn')?.addEventListener('click', () => this.savePassword());
    document.getElementById('generatePasswordBtn')?.addEventListener('click', () => this.generatePasswordForForm());
    
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
    document.getElementById('addPasswordBtn')?.addEventListener('click', () => {
      this.prefillSiteInfo();
    });
    
    // Close breach alert
    document.getElementById('closeAlert')?.addEventListener('click', () => {
      document.getElementById('breachAlert').style.display = 'none';
    });
  }

  /**
   * Create new vault
   */
  async createVault() {
    const pin = document.getElementById('setupPin').value;
    const confirmPin = document.getElementById('confirmPin').value;
    const alertEmail = document.getElementById('alertEmail')?.value?.trim() || '';
    
    if (!pin || pin.length < 4) {
      this.showError('PIN must be at least 4 digits');
      return;
    }
    
    if (pin !== confirmPin) {
      this.showError('PINs do not match');
      return;
    }

    if (alertEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alertEmail)) {
      this.showError('Please enter a valid alert email');
      return;
    }
    
    this.showLoading(true);
    
    try {
      const response = await this.sendMessage({ 
        type: 'INITIALIZE_VAULT', 
        pin: pin,
        alertEmail: alertEmail
      });
      
      if (response.success) {
        await this.checkVaultStatus();
        this.showScreen('mainScreen');
        this.showSuccess('Vault created successfully!');
        if (alertEmail) {
          this.showSuccess('Welcome email queued. Check inbox/spam.');
        }
      } else {
        this.showError(response.message);
      }
    } catch (error) {
      this.showError('Failed to create vault: ' + error.message);
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Unlock vault with PIN
   */
  async unlockVault() {
    const pin = document.getElementById('pinInput').value;
    
    if (!pin) {
      this.showError('Please enter your PIN');
      return;
    }
    
    this.showLoading(true);
    
    try {
      const response = await this.sendMessage({ 
        type: 'UNLOCK_VAULT', 
        pin: pin 
      });
      
      if (response.success) {
        await this.checkVaultStatus();
        this.showScreen('mainScreen');
        this.loadRecentPasswords();
        document.getElementById('pinInput').value = '';
      } else {
        this.showError(response.message);
      }
    } catch (error) {
      this.showError('Failed to unlock vault: ' + error.message);
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Lock vault
   */
  async lockVault() {
    try {
      await this.sendMessage({ type: 'LOCK_VAULT' });
      await this.checkVaultStatus();
      this.showScreen('unlockScreen');
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
      const response = await this.sendMessage({ 
        type: 'AUTOFILL_REQUEST', 
        url: this.currentTab.url 
      });
      
      if (response.success) {
        // Inject credentials into page
        await chrome.scripting.executeScript({
          target: { tabId: this.currentTab.id },
          function: this.fillCredentials,
          args: [response.credential]
        });
        
        this.showSuccess('Credentials filled!');
        window.close();
      } else if (response.requiresUnlock) {
        this.showScreen('unlockScreen');
      } else {
        this.showError(response.message);
      }
    } catch (error) {
      this.showError('Autofill failed: ' + error.message);
    }
  }

  /**
   * Fill credentials into page (injected function)
   */
  fillCredentials(credential) {
    const usernameFields = document.querySelectorAll('input[type="email"], input[type="text"], input[name*="user"], input[name*="email"], input[id*="user"], input[id*="email"]');
    const passwordFields = document.querySelectorAll('input[type="password"]');
    
    // Fill username
    if (usernameFields.length > 0 && credential.username) {
      usernameFields[0].value = credential.username;
      usernameFields[0].dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    // Fill password
    if (passwordFields.length > 0 && credential.password) {
      passwordFields[0].value = credential.password;
      passwordFields[0].dispatchEvent(new Event('input', { bubbles: true }));
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
      document.getElementById('siteUrl').value = this.currentTab.url;
      document.getElementById('title').value = this.currentTab.title;
    }
  }

  /**
   * Save password
   */
  async savePassword() {
    const url = document.getElementById('siteUrl').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const title = document.getElementById('title').value;
    
    if (!url || !username || !password) {
      this.showError('Please fill in all required fields');
      return;
    }
    
    this.showLoading(true);
    
    try {
      const response = await this.sendMessage({
        type: 'ADD_PASSWORD',
        entry: { url, username, password, title }
      });
      
      if (response.success) {
        this.showScreen('mainScreen');
        this.loadRecentPasswords();
        this.showSuccess('Password saved!');
        
        // Clear form
        document.getElementById('siteUrl').value = '';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        document.getElementById('title').value = '';
      } else {
        this.showError(response.message);
      }
    } catch (error) {
      this.showError('Failed to save password: ' + error.message);
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Generate password
   */
  async generatePassword() {
    try {
      const response = await this.sendMessage({ 
        type: 'GENERATE_PASSWORD',
        options: { length: 16, includeSymbols: true }
      });
      
      if (response.success) {
        // Copy to clipboard
        await navigator.clipboard.writeText(response.password);
        this.showSuccess('Password generated and copied to clipboard!');
      } else {
        this.showError('Failed to generate password');
      }
    } catch (error) {
      this.showError('Failed to generate password: ' + error.message);
    }
  }

  /**
   * Generate password for form
   */
  async generatePasswordForForm() {
    try {
      const response = await this.sendMessage({ 
        type: 'GENERATE_PASSWORD',
        options: { length: 16, includeSymbols: true }
      });
      
      if (response.success) {
        document.getElementById('password').value = response.password;
      } else {
        this.showError('Failed to generate password');
      }
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
      const response = await this.sendMessage({ 
        type: 'GET_PASSWORDS', 
        url: this.currentTab.url 
      });
      
      if (response.success) {
        this.displayPasswords(response.data);
      }
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
    // This would trigger autofill for specific password
    await this.autofill();
  }

  /**
   * Open full vault interface
   */
  openVault() {
    chrome.tabs.create({ url: chrome.runtime.getURL('vault/vault.html') });
    window.close();
  }

  /**
   * Open settings
   */
  openSettings() {
    // Could open settings page or show settings in popup
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
      
      // Hide after 5 seconds
      setTimeout(() => {
        errorElement.style.display = 'none';
      }, 5000);
    }
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    // Create temporary success message
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

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new CasperPopup();
});
