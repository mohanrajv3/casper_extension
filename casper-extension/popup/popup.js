/**
 * CASPER Popup Interface
 * Handles user interactions and vault management
 */

class CasperPopup {
  constructor() {
    this.currentScreen = 'loading';
    this.vaultStatus = null;
    this.currentTab = null;
    this.popupViewPort = null;
    
    this.init();
  }

  /**
   * Initialize popup
   */
  async init() {
    this.connectPopupViewPort();
    await this.migrateLegacyBiometricConfig();
    await this.getCurrentTab();
    await this.checkVaultStatus();
    this.setupEventListeners();
    this.showAppropriateScreen();
  }

  async migrateLegacyBiometricConfig() {
    try {
      const data = await chrome.storage.local.get(['casperBiometric']);
      const conf = data.casperBiometric || null;
      if (!conf || !conf.pin) return;
      await chrome.storage.local.set({
        casperBiometric: {
          enabled: Boolean(conf.enabled),
          credentialId: conf.credentialId || '',
          pinForDemo: conf.pin,
          migratedAt: Date.now(),
        },
      });
    } catch {
      // ignore migration failures
    }
  }

  connectPopupViewPort() {
    try {
      if (this.popupViewPort) return;
      this.popupViewPort = chrome.runtime.connect({ name: 'popup_view' });
      window.addEventListener('beforeunload', () => {
        try {
          this.popupViewPort?.disconnect();
        } catch {
          // noop
        }
      });
    } catch {
      // ignore
    }
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
    document.getElementById('biometricUnlockBtn')?.addEventListener('click', () => this.unlockWithBiometric());
    document.getElementById('recoveryUnlockBtn')?.addEventListener('click', () => this.unlockWithRecoveryQuestions());
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
    document.getElementById('tourBtn')?.addEventListener('click', () => this.openProductTour());
    
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
    const recoveryQ1 = document.getElementById('recoveryQ1')?.value?.trim() || '';
    const recoveryA1 = document.getElementById('recoveryA1')?.value?.trim() || '';
    const recoveryQ2 = document.getElementById('recoveryQ2')?.value?.trim() || '';
    const recoveryA2 = document.getElementById('recoveryA2')?.value?.trim() || '';
    
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

    if (!recoveryQ1 || !recoveryA1 || !recoveryQ2 || !recoveryA2) {
      this.showError('Please set both recovery questions and answers');
      return;
    }
    
    this.showLoading(true);
    
    try {
      const response = await this.sendMessage({ 
        type: 'INITIALIZE_VAULT', 
        pin: pin,
        alertEmail: alertEmail,
        recoveryQuestions: [
          { question: recoveryQ1, answer: recoveryA1 },
          { question: recoveryQ2, answer: recoveryA2 },
        ],
      });
      
      if (response.success) {
        await this.checkVaultStatus();
        this.showScreen('mainScreen');
        this.showSuccess('Vault created successfully!');
        if (response.data?.recoveryCodes?.length) {
          window.alert(
            `Save these recovery codes now (shown once):\n\n${response.data.recoveryCodes.join('\n')}`
          );
        }
        if (alertEmail) {
          this.showSuccess('Welcome email queued. Check inbox/spam.');
        }
        await this.offerBiometricEnrollment(pin);
      } else {
        this.showError(response.message);
      }
    } catch (error) {
      this.showError('Failed to create vault: ' + error.message);
    } finally {
      this.showLoading(false);
    }
  }

  async unlockWithRecoveryQuestions() {
    this.showLoading(true);
    try {
      const qResp = await this.sendMessage({ type: 'GET_RECOVERY_QUESTIONS' });
      if (!qResp.success) {
        this.showError(qResp.message || 'Recovery questions are not configured');
        return;
      }
      const questions = qResp.data?.questions || [];
      if (!questions.length) {
        this.showError('Recovery questions unavailable');
        return;
      }

      const answers = [];
      for (const q of questions) {
        const input = window.prompt(`Recovery question:\n${q}`, '');
        if (input === null) return;
        answers.push(String(input || '').trim());
      }

      const response = await this.sendMessage({
        type: 'UNLOCK_WITH_RECOVERY',
        answers,
      });
      if (!response.success) {
        this.showError(response.message || 'Recovery unlock failed');
        return;
      }
      await this.checkVaultStatus();
      this.showScreen('mainScreen');
      this.loadRecentPasswords();
      this.showSuccess('Recovered and unlocked');
    } catch (error) {
      this.showError('Recovery unlock failed: ' + error.message);
    } finally {
      this.showLoading(false);
    }
  }

  toBase64(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
  }

  fromBase64(base64) {
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  randomBytes(length = 32) {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return arr;
  }

  async offerBiometricEnrollment(pin) {
    if (!window.PublicKeyCredential || !navigator.credentials) return;
    const ok = window.confirm('Enable face/fingerprint unlock for Chrome demo on this device?');
    if (!ok) return;
    try {
      const userId = this.randomBytes(16);
      const challenge = this.randomBytes(32);
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'CASPER Vault' },
          user: {
            id: userId,
            name: 'casper-user',
            displayName: 'CASPER User',
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          timeout: 60000,
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          attestation: 'none',
        },
      });
      const credentialId = this.toBase64(cred.rawId);
      await chrome.storage.local.set({
        casperBiometric: {
          enabled: true,
          credentialId,
          pinForDemo: pin,
          createdAt: Date.now(),
        },
      });
      this.showSuccess('Biometric unlock enabled on this device');
    } catch (error) {
      this.showError('Biometric enrollment skipped: ' + error.message);
    }
  }

  promptForHiddenPin(title = 'PIN Required', message = 'Enter your PIN to continue') {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'background:rgba(0,0,0,.45)',
        'z-index:2000',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:12px',
      ].join(';');

      const card = document.createElement('div');
      card.style.cssText = [
        'width:100%',
        'max-width:320px',
        'background:#fff',
        'color:#111827',
        'border-radius:10px',
        'padding:14px',
        'box-shadow:0 14px 32px rgba(0,0,0,.25)',
      ].join(';');
      card.innerHTML = `
        <div style="font-weight:700;margin-bottom:6px;">${title}</div>
        <div style="font-size:13px;color:#475569;margin-bottom:10px;">${message}</div>
        <input id="popupHiddenPinInput" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="••••" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;">
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
          <button id="popupHiddenPinCancel" style="padding:8px 10px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:8px;cursor:pointer;">Cancel</button>
          <button id="popupHiddenPinOk" style="padding:8px 10px;border:0;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer;">Continue</button>
        </div>
      `;

      overlay.appendChild(card);
      document.body.appendChild(overlay);
      const input = card.querySelector('#popupHiddenPinInput');
      const okBtn = card.querySelector('#popupHiddenPinOk');
      const cancelBtn = card.querySelector('#popupHiddenPinCancel');

      const done = (value) => {
        overlay.remove();
        resolve(value);
      };

      okBtn?.addEventListener('click', () => done(String(input?.value || '').trim()));
      cancelBtn?.addEventListener('click', () => done(''));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) done('');
      });
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') done(String(input?.value || '').trim());
        if (e.key === 'Escape') done('');
      });
      input?.focus();
    });
  }

  async unlockWithBiometric() {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      this.showError('Biometric unlock is not supported on this browser/device');
      return;
    }
    this.showLoading(true);
    try {
      const data = await chrome.storage.local.get(['casperBiometric']);
      const conf = data.casperBiometric || {};
      if (!conf.enabled || !conf.credentialId) {
        this.showError('Biometric unlock is not enabled yet');
        return;
      }
      const challenge = this.randomBytes(32);
      await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ type: 'public-key', id: this.fromBase64(conf.credentialId) }],
          userVerification: 'required',
          timeout: 60000,
        },
      });
      const pin = String(conf.pinForDemo || '').trim();
      if (!pin) {
        this.showError('Biometric PIN data missing. Re-enroll biometric unlock once.');
        return;
      }
      const response = await this.sendMessage({
        type: 'UNLOCK_VAULT',
        pin,
      });
      if (!response.success) {
        this.showError(response.message || 'Biometric unlock failed');
        return;
      }
      await this.checkVaultStatus();
      this.showScreen('mainScreen');
      this.loadRecentPasswords();
      this.showSuccess('Unlocked with biometric');
    } catch (error) {
      this.showError('Biometric unlock failed: ' + error.message);
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
    chrome.tabs.create({ url: chrome.runtime.getURL('vault/vault.html#settings') });
    window.close();
  }

  openProductTour() {
    chrome.tabs.create({ url: chrome.runtime.getURL('vault/vault.html?tour=1#passwords') });
    window.close();
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
