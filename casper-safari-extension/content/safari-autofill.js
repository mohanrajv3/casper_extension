/**
 * CASPER Safari Content Script - Autofill
 * Safari-compatible version of autofill functionality
 */

// Safari compatibility layer
const safariCompat = {
  sendMessage: (message, callback) => {
    if (typeof safari !== 'undefined' && safari.extension) {
      // Safari extension messaging
      const messageId = Date.now() + Math.random();
      message.id = messageId;
      
      safari.extension.dispatchMessage('message', message);
      
      // Listen for response
      const responseHandler = (event) => {
        if (event.message.id === messageId) {
          safari.extension.removeEventListener('message', responseHandler);
          if (callback) callback(event.message.response);
        }
      };
      
      safari.extension.addEventListener('message', responseHandler);
    } else if (typeof chrome !== 'undefined' && chrome.runtime) {
      // Chrome compatibility
      chrome.runtime.sendMessage(message, callback);
    } else {
      // Fallback
      console.warn('No messaging API available');
      if (callback) callback({ success: false, message: 'No messaging API' });
    }
  }
};

class CasperSafariAutofill {
  constructor() {
    this.isInjected = false;
    this.loginForms = [];
    this.observer = null;
    
    this.init();
  }

  /**
   * Initialize autofill system
   */
  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.start());
    } else {
      this.start();
    }
  }

  /**
   * Start autofill detection
   */
  start() {
    this.detectLoginForms();
    this.setupFormObserver();
    this.setupMessageListener();
  }

  /**
   * Detect login forms on the page
   */
  detectLoginForms() {
    const passwordFields = document.querySelectorAll('input[type="password"]');
    
    passwordFields.forEach(passwordField => {
      const form = passwordField.closest('form') || document.body;
      
      if (!this.isLoginForm(form)) return;
      
      const loginForm = {
        form: form,
        passwordField: passwordField,
        usernameField: this.findUsernameField(form, passwordField),
        submitButton: this.findSubmitButton(form)
      };
      
      this.loginForms.push(loginForm);
      this.enhanceLoginForm(loginForm);
    });

    if (this.loginForms.length > 0) {
      this.notifyLoginFormsDetected();
    }
  }

  /**
   * Check if form is likely a login form
   */
  isLoginForm(form) {
    if (form.hasAttribute('data-casper-processed')) {
      return false;
    }
    
    const formText = form.textContent.toLowerCase();
    const loginKeywords = ['login', 'sign in', 'log in', 'signin', 'password', 'email'];
    
    return loginKeywords.some(keyword => formText.includes(keyword));
  }

  /**
   * Find username field near password field
   */
  findUsernameField(form, passwordField) {
    const usernameSelectors = [
      'input[type="email"]',
      'input[type="text"][name*="user"]',
      'input[type="text"][name*="email"]',
      'input[type="text"][id*="user"]',
      'input[type="text"][id*="email"]',
      'input[type="text"][placeholder*="email"]',
      'input[type="text"][placeholder*="username"]'
    ];
    
    for (const selector of usernameSelectors) {
      const field = form.querySelector(selector);
      if (field && field !== passwordField) {
        return field;
      }
    }
    
    const textInputs = form.querySelectorAll('input[type="text"]');
    for (const input of textInputs) {
      if (this.isFieldBefore(input, passwordField)) {
        return input;
      }
    }
    
    return null;
  }

  /**
   * Find submit button for form
   */
  findSubmitButton(form) {
    const submitSelectors = [
      'input[type="submit"]',
      'button[type="submit"]',
      'button:not([type])'
    ];
    
    for (const selector of submitSelectors) {
      const button = form.querySelector(selector);
      if (button) return button;
    }
    
    return null;
  }

  /**
   * Check if field1 appears before field2 in DOM
   */
  isFieldBefore(field1, field2) {
    return field1.compareDocumentPosition(field2) & Node.DOCUMENT_POSITION_FOLLOWING;
  }

  /**
   * Enhance login form with CASPER features
   */
  enhanceLoginForm(loginForm) {
    const { form, passwordField, usernameField } = loginForm;
    
    form.setAttribute('data-casper-processed', 'true');
    
    if (!form.querySelector('.casper-autofill-btn')) {
      this.addAutofillButton(loginForm);
    }
    
    form.addEventListener('submit', (e) => {
      this.handleFormSubmit(e, loginForm);
    });
    
    if (usernameField) {
      usernameField.addEventListener('input', () => this.handleFieldChange(loginForm));
    }
    if (passwordField) {
      passwordField.addEventListener('input', () => this.handleFieldChange(loginForm));
    }
  }

  /**
   * Add autofill button to login form
   */
  addAutofillButton(loginForm) {
    const { form, passwordField } = loginForm;
    
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'casper-autofill-btn';
    button.innerHTML = '🔐 Fill with CASPER';
    button.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      margin: 8px 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      transition: all 0.2s;
      z-index: 10000;
      position: relative;
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-1px)';
      button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = 'none';
    });
    
    button.addEventListener('click', () => {
      this.requestAutofill();
    });
    
    passwordField.parentNode.insertBefore(button, passwordField.nextSibling);
  }

  /**
   * Handle form submission
   */
  handleFormSubmit(event, loginForm) {
    const { usernameField, passwordField } = loginForm;
    
    const username = usernameField ? usernameField.value : '';
    const password = passwordField ? passwordField.value : '';
    
    if (username && password) {
      setTimeout(() => {
        this.offerToSaveCredentials(username, password);
      }, 1000);
    }
  }

  /**
   * Handle field changes
   */
  handleFieldChange(loginForm) {
    // Could implement real-time validation or suggestions
  }

  /**
   * Request autofill from background
   */
  async requestAutofill() {
    try {
      safariCompat.sendMessage({
        type: 'AUTOFILL_REQUEST',
        url: window.location.href
      }, (response) => {
        if (response && response.success && response.credential) {
          this.fillCredentials(response.credential);
          this.showNotification('Credentials filled successfully!', 'success');
        } else if (response && response.requiresUnlock) {
          this.showNotification('Please unlock your CASPER vault first', 'info');
        } else {
          this.showNotification(response?.message || 'No credentials found for this site', 'warning');
        }
      });
    } catch (error) {
      this.showNotification('Autofill failed: ' + error.message, 'error');
    }
  }

  /**
   * Fill credentials into form fields
   */
  fillCredentials(credential) {
    this.loginForms.forEach(loginForm => {
      const { usernameField, passwordField } = loginForm;
      
      if (usernameField && credential.username) {
        usernameField.value = credential.username;
        usernameField.dispatchEvent(new Event('input', { bubbles: true }));
        usernameField.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      if (passwordField && credential.password) {
        passwordField.value = credential.password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  /**
   * Offer to save credentials
   */
  offerToSaveCredentials(username, password) {
    safariCompat.sendMessage({
      type: 'GET_PASSWORDS',
      url: window.location.href
    }, (response) => {
      if (response && response.success) {
        const existingCredentials = response.data.find(cred => 
          cred.username === username
        );
        
        if (!existingCredentials) {
          this.showSaveCredentialsDialog(username, password);
        }
      }
    });
  }

  /**
   * Show save credentials dialog
   */
  showSaveCredentialsDialog(username, password) {
    const dialog = document.createElement('div');
    dialog.className = 'casper-save-dialog';
    dialog.innerHTML = `
      <div class="casper-dialog-content">
        <div class="casper-dialog-header">
          <span class="casper-icon">🔐</span>
          <span class="casper-title">Save Password?</span>
          <button class="casper-close-btn">×</button>
        </div>
        <div class="casper-dialog-body">
          <p>Save credentials for <strong>${this.escapeHtml(window.location.hostname)}</strong>?</p>
          <div class="casper-credential-preview">
            <div>Username: ${this.escapeHtml(username)}</div>
            <div>Password: ${'•'.repeat(password.length)}</div>
          </div>
        </div>
        <div class="casper-dialog-actions">
          <button class="casper-btn casper-btn-secondary casper-cancel-btn">Cancel</button>
          <button class="casper-btn casper-btn-primary casper-save-btn">Save</button>
        </div>
      </div>
    `;
    
    dialog.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      width: 320px;
      border: 1px solid #e5e7eb;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      .casper-dialog-content { padding: 0; }
      .casper-dialog-header { 
        display: flex; 
        align-items: center; 
        gap: 8px; 
        padding: 16px 20px 12px; 
        border-bottom: 1px solid #e5e7eb;
      }
      .casper-icon { font-size: 20px; }
      .casper-title { font-weight: 600; flex: 1; }
      .casper-close-btn { 
        background: none; 
        border: none; 
        font-size: 18px; 
        cursor: pointer; 
        color: #6b7280;
      }
      .casper-dialog-body { padding: 16px 20px; }
      .casper-credential-preview { 
        background: #f8fafc; 
        padding: 12px; 
        border-radius: 6px; 
        margin-top: 12px; 
        font-size: 14px;
        color: #374151;
      }
      .casper-dialog-actions { 
        display: flex; 
        gap: 8px; 
        padding: 12px 20px 20px; 
      }
      .casper-btn { 
        padding: 8px 16px; 
        border-radius: 6px; 
        font-size: 14px; 
        cursor: pointer; 
        border: none;
        font-weight: 500;
      }
      .casper-btn-primary { 
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
        color: white; 
      }
      .casper-btn-secondary { 
        background: #f8fafc; 
        color: #64748b; 
        border: 1px solid #e2e8f0;
      }
    `;
    document.head.appendChild(style);
    
    dialog.querySelector('.casper-close-btn').addEventListener('click', () => {
      dialog.remove();
      style.remove();
    });
    
    dialog.querySelector('.casper-cancel-btn').addEventListener('click', () => {
      dialog.remove();
      style.remove();
    });
    
    dialog.querySelector('.casper-save-btn').addEventListener('click', () => {
      this.saveCredentials(username, password);
      dialog.remove();
      style.remove();
    });
    
    document.body.appendChild(dialog);
    
    setTimeout(() => {
      if (dialog.parentNode) {
        dialog.remove();
        style.remove();
      }
    }, 10000);
  }

  /**
   * Save credentials via background
   */
  async saveCredentials(username, password) {
    try {
      safariCompat.sendMessage({
        type: 'SAVE_CREDENTIALS',
        credentials: { username, password }
      }, (response) => {
        if (response && response.success) {
          this.showNotification('Credentials saved successfully!', 'success');
        } else {
          this.showNotification('Failed to save credentials: ' + (response?.message || 'Unknown error'), 'error');
        }
      });
    } catch (error) {
      this.showNotification('Failed to save credentials: ' + error.message, 'error');
    }
  }

  /**
   * Setup form observer for dynamic content
   */
  setupFormObserver() {
    this.observer = new MutationObserver((mutations) => {
      let shouldRecheck = false;
      
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'FORM' || node.querySelector('form')) {
              shouldRecheck = true;
            }
          }
        });
      });
      
      if (shouldRecheck) {
        setTimeout(() => this.detectLoginForms(), 100);
      }
    });
    
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Setup message listener
   */
  setupMessageListener() {
    // Safari message handling is done through the background script
    if (typeof safari !== 'undefined' && safari.extension) {
      safari.extension.addEventListener('message', (event) => {
        if (event.message.type === 'FILL_CREDENTIALS') {
          this.fillCredentials(event.message.credential);
        }
      });
    }
  }

  /**
   * Notify background about login forms
   */
  notifyLoginFormsDetected() {
    safariCompat.sendMessage({
      type: 'LOGIN_FORMS_DETECTED',
      url: window.location.href,
      count: this.loginForms.length
    }, () => {});
  }

  /**
   * Show notification to user
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'casper-notification';
    
    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6'
    };
    
    notification.innerHTML = `
      <div class="casper-notification-content">
        <span class="casper-notification-icon">🔐</span>
        <span class="casper-notification-message">${this.escapeHtml(message)}</span>
        <button class="casper-notification-close">×</button>
      </div>
    `;
    
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      background: ${colors[type]};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      max-width: 300px;
    `;
    
    const content = notification.querySelector('.casper-notification-content');
    content.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    const closeBtn = notification.querySelector('.casper-notification-close');
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: 16px;
      cursor: pointer;
      margin-left: auto;
    `;
    
    closeBtn.addEventListener('click', () => {
      notification.remove();
    });
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
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

// Initialize Safari autofill
new CasperSafariAutofill();