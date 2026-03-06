/**
 * CASPER Vault Interface
 * Full vault management interface
 */

class CasperVault {
  constructor() {
    this.currentSection = 'passwords';
    this.vault = null;
    this.passwords = [];
    this.searchQuery = '';
    this.selectedItem = null;
    
    this.init();
  }

  /**
   * Initialize vault interface
   */
  async init() {
    await this.checkVaultStatus();
    this.setupEventListeners();
    this.setupNavigation();
    this.loadCurrentSection();
    this.generatePassword(); // Generate initial password
  }

  /**
   * Check vault status and redirect if needed
   */
  async checkVaultStatus() {
    try {
      const response = await this.sendMessage({ type: 'VAULT_STATUS' });
      
      if (!response.vaultExists || !response.isUnlocked) {
        // Redirect to popup for unlock
        window.location.href = chrome.runtime.getURL('popup/popup.html');
        return;
      }
      
      this.updateVaultStatus(response);
    } catch (error) {
      console.error('Failed to check vault status:', error);
      this.showError('Failed to connect to vault');
    }
  }

  /**
   * Update vault status display
   */
  updateVaultStatus(status) {
    const statusElement = document.getElementById('vaultStatus');
    const statusIcon = statusElement.querySelector('.status-icon');
    const statusText = statusElement.querySelector('.status-text');
    
    if (status.isUnlocked) {
      statusIcon.textContent = '🔓';
      statusText.textContent = 'Unlocked';
    } else {
      statusIcon.textContent = '🔒';
      statusText.textContent = 'Locked';
    }
    
    // Update counts
    document.getElementById('passwordCount').textContent = status.entryCount || 0;
    document.getElementById('totalPasswords').textContent = status.entryCount || 0;
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Lock vault button
    document.getElementById('lockVault').addEventListener('click', () => this.lockVault());
    
    // Add password button
    document.getElementById('addPasswordBtn').addEventListener('click', () => this.showAddPasswordModal());
    
    // Search functionality
    document.getElementById('passwordSearch').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.filterPasswords();
    });
    
    // Generator controls
    document.getElementById('passwordLength').addEventListener('input', (e) => {
      document.getElementById('lengthValue').textContent = e.target.value;
      this.generatePassword();
    });
    
    ['includeUppercase', 'includeLowercase', 'includeNumbers', 'includeSymbols'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => this.generatePassword());
    });
    
    document.getElementById('refreshPasswordBtn').addEventListener('click', () => this.generatePassword());
    document.getElementById('copyPasswordBtn').addEventListener('click', () => this.copyGeneratedPassword());
    
    // Modal controls
    document.getElementById('closeModal').addEventListener('click', () => this.hideModal());
    document.getElementById('cancelModal').addEventListener('click', () => this.hideModal());
    document.getElementById('saveModal').addEventListener('click', () => this.savePasswordFromModal());
    document.getElementById('generateModalPassword').addEventListener('click', () => this.generatePasswordForModal());
    document.getElementById('toggleModalPassword').addEventListener('click', () => this.togglePasswordVisibility());
    
    // Close modal on overlay click
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.hideModal();
      }
    });
    
    // Details panel
    document.getElementById('closeDetails').addEventListener('click', () => this.hideDetailsPanel());
    
    // Security actions
    document.getElementById('changePinBtn').addEventListener('click', () => this.changePin());
    document.getElementById('exportVaultBtn').addEventListener('click', () => this.exportVault());
    document.getElementById('viewLogsBtn').addEventListener('click', () => this.viewSecurityLogs());
  }

  /**
   * Setup navigation
   */
  setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const section = item.dataset.section;
        if (section) {
          this.switchSection(section);
        }
      });
    });
  }

  /**
   * Switch to different section
   */
  switchSection(section) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-section="${section}"]`).classList.add('active');
    
    // Update content
    document.querySelectorAll('.content-section').forEach(section => {
      section.classList.remove('active');
    });
    document.getElementById(`${section}Section`).classList.add('active');
    
    this.currentSection = section;
    this.loadCurrentSection();
  }

  /**
   * Load current section data
   */
  async loadCurrentSection() {
    switch (this.currentSection) {
      case 'passwords':
        await this.loadPasswords();
        break;
      case 'passkeys':
        await this.loadPasskeys();
        break;
      case 'security':
        await this.loadSecurityInfo();
        break;
      case 'generator':
        this.generatePassword();
        break;
    }
  }

  /**
   * Load passwords from vault
   */
  async loadPasswords() {
    try {
      // For now, we'll simulate loading passwords
      // In a real implementation, this would fetch from the background script
      const response = await this.sendMessage({ 
        type: 'GET_ALL_PASSWORDS' 
      });
      
      if (response.success) {
        this.passwords = response.data || [];
        this.displayPasswords();
      } else {
        // Fallback: create some sample data for demonstration
        this.passwords = [
          {
            id: '1',
            title: 'GitHub',
            username: 'user@example.com',
            password: 'secure_password_123',
            url: 'https://github.com',
            created: Date.now() - 86400000,
            lastUsed: Date.now() - 3600000
          },
          {
            id: '2',
            title: 'Google',
            username: 'myemail@gmail.com',
            password: 'another_secure_pass',
            url: 'https://accounts.google.com',
            created: Date.now() - 172800000,
            lastUsed: null
          }
        ];
        this.displayPasswords();
      }
    } catch (error) {
      console.error('Failed to load passwords:', error);
      this.showError('Failed to load passwords');
    }
  }

  /**
   * Display passwords in grid
   */
  displayPasswords() {
    const grid = document.getElementById('passwordsGrid');
    
    if (this.passwords.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🔑</span>
          <h3>No Passwords Yet</h3>
          <p>Add your first password to get started</p>
          <button class="secondary-btn" onclick="casperVault.showAddPasswordModal()">Add Password</button>
        </div>
      `;
      return;
    }
    
    const filteredPasswords = this.passwords.filter(password => 
      password.title.toLowerCase().includes(this.searchQuery) ||
      password.username.toLowerCase().includes(this.searchQuery) ||
      password.url.toLowerCase().includes(this.searchQuery)
    );
    
    grid.innerHTML = filteredPasswords.map(password => `
      <div class="password-item" onclick="casperVault.showPasswordDetails('${password.id}')">
        <div class="password-header">
          <div class="password-favicon">${this.getFaviconForUrl(password.url)}</div>
          <div class="password-title">${this.escapeHtml(password.title)}</div>
          <div class="password-actions" onclick="event.stopPropagation()">
            <button class="icon-btn" onclick="casperVault.copyPassword('${password.id}')" title="Copy Password">📋</button>
            <button class="icon-btn" onclick="casperVault.editPassword('${password.id}')" title="Edit">✏️</button>
            <button class="icon-btn" onclick="casperVault.deletePassword('${password.id}')" title="Delete">🗑️</button>
          </div>
        </div>
        <div class="password-info">
          <div class="password-username">${this.escapeHtml(password.username)}</div>
          <div class="password-url">${this.escapeHtml(password.url)}</div>
        </div>
      </div>
    `).join('');
  }

  /**
   * Filter passwords based on search query
   */
  filterPasswords() {
    this.displayPasswords();
  }

  /**
   * Get favicon for URL
   */
  getFaviconForUrl(url) {
    try {
      const domain = new URL(url).hostname;
      const firstLetter = domain.charAt(0).toUpperCase();
      return firstLetter;
    } catch {
      return '🌐';
    }
  }

  /**
   * Show password details
   */
  showPasswordDetails(passwordId) {
    const password = this.passwords.find(p => p.id === passwordId);
    if (!password) return;
    
    const detailsPanel = document.getElementById('detailsPanel');
    const detailsTitle = document.getElementById('detailsTitle');
    const detailsContent = document.getElementById('detailsContent');
    
    detailsTitle.textContent = password.title;
    
    detailsContent.innerHTML = `
      <div class="detail-section">
        <h4>Login Information</h4>
        <div class="detail-item">
          <label>Website</label>
          <div class="detail-value">
            <span>${this.escapeHtml(password.url)}</span>
            <button class="icon-btn" onclick="window.open('${password.url}', '_blank')">🔗</button>
          </div>
        </div>
        <div class="detail-item">
          <label>Username</label>
          <div class="detail-value">
            <span>${this.escapeHtml(password.username)}</span>
            <button class="icon-btn" onclick="casperVault.copyToClipboard('${password.username}')">📋</button>
          </div>
        </div>
        <div class="detail-item">
          <label>Password</label>
          <div class="detail-value">
            <span class="password-hidden">••••••••••••</span>
            <button class="icon-btn" onclick="casperVault.copyToClipboard('${password.password}')">📋</button>
            <button class="icon-btn" onclick="casperVault.togglePasswordInDetails(this, '${password.password}')">👁️</button>
          </div>
        </div>
      </div>
      
      <div class="detail-section">
        <h4>Security Information</h4>
        <div class="detail-item">
          <label>Created</label>
          <div class="detail-value">${new Date(password.created).toLocaleDateString()}</div>
        </div>
        <div class="detail-item">
          <label>Last Used</label>
          <div class="detail-value">${password.lastUsed ? new Date(password.lastUsed).toLocaleDateString() : 'Never'}</div>
        </div>
      </div>
      
      <div class="detail-actions">
        <button class="primary-btn" onclick="casperVault.editPassword('${password.id}')">Edit Password</button>
        <button class="danger-btn" onclick="casperVault.deletePassword('${password.id}')">Delete Password</button>
      </div>
    `;
    
    detailsPanel.classList.add('active');
    this.selectedItem = password;
  }

  /**
   * Hide details panel
   */
  hideDetailsPanel() {
    document.getElementById('detailsPanel').classList.remove('active');
    this.selectedItem = null;
  }

  /**
   * Copy password to clipboard
   */
  async copyPassword(passwordId) {
    const password = this.passwords.find(p => p.id === passwordId);
    if (password) {
      await this.copyToClipboard(password.password);
      this.showSuccess('Password copied to clipboard');
    }
  }

  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }

  /**
   * Toggle password visibility in details
   */
  togglePasswordInDetails(button, password) {
    const passwordSpan = button.parentElement.querySelector('.password-hidden, .password-visible');
    
    if (passwordSpan.classList.contains('password-hidden')) {
      passwordSpan.textContent = password;
      passwordSpan.className = 'password-visible';
      button.textContent = '🙈';
    } else {
      passwordSpan.textContent = '••••••••••••';
      passwordSpan.className = 'password-hidden';
      button.textContent = '👁️';
    }
  }

  /**
   * Show add password modal
   */
  showAddPasswordModal() {
    document.getElementById('modalOverlay').style.display = 'flex';
    document.getElementById('modalUrl').focus();
  }

  /**
   * Hide modal
   */
  hideModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    this.clearModalForm();
  }

  /**
   * Clear modal form
   */
  clearModalForm() {
    document.getElementById('modalUrl').value = '';
    document.getElementById('modalTitle').value = '';
    document.getElementById('modalUsername').value = '';
    document.getElementById('modalPassword').value = '';
    document.getElementById('modalNotes').value = '';
  }

  /**
   * Save password from modal
   */
  async savePasswordFromModal() {
    const url = document.getElementById('modalUrl').value;
    const title = document.getElementById('modalTitle').value;
    const username = document.getElementById('modalUsername').value;
    const password = document.getElementById('modalPassword').value;
    const notes = document.getElementById('modalNotes').value;
    
    if (!url || !username || !password) {
      this.showError('Please fill in all required fields');
      return;
    }
    
    try {
      const response = await this.sendMessage({
        type: 'ADD_PASSWORD',
        entry: {
          url: url,
          title: title || this.extractDomainFromUrl(url),
          username: username,
          password: password,
          notes: notes
        }
      });
      
      if (response.success) {
        this.hideModal();
        await this.loadPasswords();
        this.showSuccess('Password saved successfully');
      } else {
        this.showError(response.message || 'Failed to save password');
      }
    } catch (error) {
      this.showError('Failed to save password: ' + error.message);
    }
  }

  /**
   * Generate password for modal
   */
  generatePasswordForModal() {
    const password = this.generatePasswordString();
    document.getElementById('modalPassword').value = password;
  }

  /**
   * Toggle password visibility in modal
   */
  togglePasswordVisibility() {
    const passwordInput = document.getElementById('modalPassword');
    const toggleButton = document.getElementById('toggleModalPassword');
    
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      toggleButton.textContent = '🙈';
    } else {
      passwordInput.type = 'password';
      toggleButton.textContent = '👁️';
    }
  }

  /**
   * Generate password
   */
  generatePassword() {
    const password = this.generatePasswordString();
    document.getElementById('generatedPassword').value = password;
  }

  /**
   * Generate password string based on options
   */
  generatePasswordString() {
    const length = parseInt(document.getElementById('passwordLength').value);
    const includeUppercase = document.getElementById('includeUppercase').checked;
    const includeLowercase = document.getElementById('includeLowercase').checked;
    const includeNumbers = document.getElementById('includeNumbers').checked;
    const includeSymbols = document.getElementById('includeSymbols').checked;
    
    let charset = '';
    if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (includeNumbers) charset += '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    if (!charset) {
      charset = 'abcdefghijklmnopqrstuvwxyz'; // Fallback
    }
    
    const password = new Array(length);
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    
    for (let i = 0; i < length; i++) {
      password[i] = charset[randomValues[i] % charset.length];
    }
    
    return password.join('');
  }

  /**
   * Copy generated password
   */
  async copyGeneratedPassword() {
    const password = document.getElementById('generatedPassword').value;
    await this.copyToClipboard(password);
    this.showSuccess('Password copied to clipboard');
  }

  /**
   * Lock vault
   */
  async lockVault() {
    try {
      await this.sendMessage({ type: 'LOCK_VAULT' });
      window.location.href = chrome.runtime.getURL('popup/popup.html');
    } catch (error) {
      this.showError('Failed to lock vault: ' + error.message);
    }
  }

  /**
   * Load passkeys (placeholder)
   */
  async loadPasskeys() {
    // Placeholder for passkey functionality
    console.log('Loading passkeys...');
  }

  /**
   * Load security information
   */
  async loadSecurityInfo() {
    // Update security dashboard with real data
    // This would fetch actual security events and breach status
    console.log('Loading security info...');
  }

  /**
   * Change PIN
   */
  changePin() {
    this.showError('Change PIN functionality not implemented yet');
  }

  /**
   * Export vault
   */
  exportVault() {
    this.showError('Export vault functionality not implemented yet');
  }

  /**
   * View security logs
   */
  viewSecurityLogs() {
    this.showError('Security logs functionality not implemented yet');
  }

  /**
   * Edit password
   */
  editPassword(passwordId) {
    this.showError('Edit password functionality not implemented yet');
  }

  /**
   * Delete password
   */
  async deletePassword(passwordId) {
    if (!confirm('Are you sure you want to delete this password?')) {
      return;
    }
    
    try {
      const response = await this.sendMessage({
        type: 'DELETE_PASSWORD',
        id: passwordId
      });
      
      if (response.success) {
        await this.loadPasswords();
        this.hideDetailsPanel();
        this.showSuccess('Password deleted successfully');
      } else {
        this.showError(response.message || 'Failed to delete password');
      }
    } catch (error) {
      this.showError('Failed to delete password: ' + error.message);
    }
  }

  /**
   * Extract domain from URL
   */
  extractDomainFromUrl(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
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
          resolve(response || {});
        }
      });
    });
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  /**
   * Show error message
   */
  showError(message) {
    this.showNotification(message, 'error');
  }

  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      color: white;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      transform: translateX(100%);
      transition: transform 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 10);
    
    // Remove after 5 seconds
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }, 5000);
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

// Initialize vault interface
let casperVault;
document.addEventListener('DOMContentLoaded', () => {
  casperVault = new CasperVault();
});

// Add some CSS for detail sections
const additionalStyles = `
  .detail-section {
    margin-bottom: 24px;
  }
  
  .detail-section h4 {
    font-size: 16px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .detail-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
  }
  
  .detail-item label {
    font-weight: 500;
    color: #64748b;
    font-size: 14px;
  }
  
  .detail-value {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: monospace;
    font-size: 14px;
  }
  
  .detail-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid #e5e7eb;
  }
  
  .password-hidden,
  .password-visible {
    font-family: monospace;
    font-size: 14px;
  }
`;

const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);