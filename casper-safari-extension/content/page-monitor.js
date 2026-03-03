/**
 * CASPER Safari Content Script - Page Monitor
 * Safari-compatible version of security monitoring
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
  }
};

class CasperSafariPageMonitor {
  constructor() {
    this.isActive = false;
    this.securityEvents = [];
    this.webAuthnObserver = null;
    
    this.init();
  }

  /**
   * Initialize page monitoring
   */
  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.start());
    } else {
      this.start();
    }
  }

  /**
   * Start monitoring
   */
  start() {
    this.isActive = true;
    this.monitorWebAuthn();
    this.monitorSecurityEvents();
    this.setupMessageListener();
  }

  /**
   * Monitor WebAuthn API calls for breach detection
   */
  monitorWebAuthn() {
    if (navigator.credentials && navigator.credentials.create) {
      const originalCreate = navigator.credentials.create.bind(navigator.credentials);
      
      navigator.credentials.create = async (options) => {
        try {
          const result = await originalCreate(options);
          
          if (options.publicKey) {
            await this.handleWebAuthnCreate(options.publicKey, result);
          }
          
          return result;
        } catch (error) {
          await this.handleWebAuthnError('create', error);
          throw error;
        }
      };
    }

    if (navigator.credentials && navigator.credentials.get) {
      const originalGet = navigator.credentials.get.bind(navigator.credentials);
      
      navigator.credentials.get = async (options) => {
        try {
          const result = await originalGet(options);
          
          if (options.publicKey && result) {
            await this.handleWebAuthnGet(options.publicKey, result);
          }
          
          return result;
        } catch (error) {
          await this.handleWebAuthnError('get', error);
          throw error;
        }
      };
    }
  }

  /**
   * Handle WebAuthn credential creation
   */
  async handleWebAuthnCreate(options, credential) {
    try {
      const event = {
        type: 'webauthn_create',
        timestamp: Date.now(),
        url: window.location.href,
        rpId: options.rp?.id,
        userId: options.user?.id ? this.arrayBufferToBase64(options.user.id) : null,
        credentialId: credential?.id || null
      };
      
      this.logSecurityEvent(event);
      
      if (credential && credential.response) {
        await this.checkForBreachIndicators(credential);
      }
      
    } catch (error) {
      console.error('Error handling WebAuthn create:', error);
    }
  }

  /**
   * Handle WebAuthn credential authentication
   */
  async handleWebAuthnGet(options, assertion) {
    try {
      const event = {
        type: 'webauthn_get',
        timestamp: Date.now(),
        url: window.location.href,
        rpId: options.rpId,
        credentialId: assertion?.id || null,
        userHandle: assertion?.response?.userHandle ? 
          this.arrayBufferToBase64(assertion.response.userHandle) : null
      };
      
      this.logSecurityEvent(event);
      
      if (assertion && assertion.response) {
        await this.checkForBreachIndicators(assertion);
      }
      
    } catch (error) {
      console.error('Error handling WebAuthn get:', error);
    }
  }

  /**
   * Handle WebAuthn errors
   */
  async handleWebAuthnError(operation, error) {
    const event = {
      type: 'webauthn_error',
      timestamp: Date.now(),
      url: window.location.href,
      operation: operation,
      error: error.name || 'Unknown',
      message: error.message || ''
    };
    
    this.logSecurityEvent(event);
  }

  /**
   * Check for breach indicators
   */
  async checkForBreachIndicators(credential) {
    try {
      let publicKey = null;
      
      if (credential.response && credential.response.publicKey) {
        publicKey = new Uint8Array(credential.response.publicKey);
      } else if (credential.response && credential.response.authenticatorData) {
        publicKey = this.extractPublicKeyFromAuthData(credential.response.authenticatorData);
      }
      
      if (publicKey) {
        safariCompat.sendMessage({
          type: 'CHECK_BREACH',
          publicKey: this.arrayToBase64(publicKey),
          url: window.location.href,
          credentialId: credential.id
        }, (response) => {
          if (response && response.success && response.breach) {
            this.handleBreachDetection(response);
          }
        });
      }
      
    } catch (error) {
      console.error('Error checking breach indicators:', error);
    }
  }

  /**
   * Extract public key from authenticator data
   */
  extractPublicKeyFromAuthData(authData) {
    try {
      const dataView = new DataView(authData);
      let offset = 37;
      
      const flags = dataView.getUint8(32);
      const attestedCredentialDataIncluded = (flags & 0x40) !== 0;
      
      if (attestedCredentialDataIncluded) {
        offset += 16;
        const credIdLength = dataView.getUint16(offset);
        offset += 2;
        offset += credIdLength;
        return new Uint8Array(authData.slice(offset, offset + 32));
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting public key:', error);
      return null;
    }
  }

  /**
   * Handle breach detection
   */
  async handleBreachDetection(breachInfo) {
    this.showBreachAlert(breachInfo);
    
    const event = {
      type: 'breach_detected',
      timestamp: Date.now(),
      url: window.location.href,
      severity: breachInfo.severity || 'CRITICAL',
      reason: breachInfo.reason || 'Unknown'
    };
    
    this.logSecurityEvent(event);
    
    safariCompat.sendMessage({
      type: 'BREACH_DETECTED',
      event: event,
      breachInfo: breachInfo
    }, () => {});
  }

  /**
   * Show breach alert to user
   */
  showBreachAlert(breachInfo) {
    const alert = document.createElement('div');
    alert.className = 'casper-breach-alert';
    alert.innerHTML = `
      <div class="casper-breach-content">
        <div class="casper-breach-header">
          <span class="casper-breach-icon">🚨</span>
          <h3>SECURITY BREACH DETECTED</h3>
        </div>
        <div class="casper-breach-body">
          <p><strong>Your CASPER vault may be compromised!</strong></p>
          <p>${this.escapeHtml(breachInfo.reason || 'Suspicious activity detected')}</p>
          <p>Please change your PIN immediately and regenerate your vault.</p>
        </div>
        <div class="casper-breach-actions">
          <button class="casper-breach-btn casper-breach-primary" id="casperOpenVault">
            Open CASPER Vault
          </button>
          <button class="casper-breach-btn casper-breach-secondary" id="casperDismiss">
            Dismiss
          </button>
        </div>
      </div>
    `;
    
    alert.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 999999;
      background: rgba(220, 38, 38, 0.95);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      backdrop-filter: blur(10px);
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      .casper-breach-content {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
        text-align: center;
      }
      .casper-breach-header {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      .casper-breach-icon {
        font-size: 32px;
        animation: pulse 1s infinite;
      }
      .casper-breach-header h3 {
        margin: 0;
        font-size: 24px;
        font-weight: 700;
      }
      .casper-breach-body p {
        margin: 8px 0;
        font-size: 16px;
        line-height: 1.5;
      }
      .casper-breach-actions {
        display: flex;
        gap: 12px;
        justify-content: center;
        margin-top: 20px;
      }
      .casper-breach-btn {
        padding: 12px 24px;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      .casper-breach-primary {
        background: white;
        color: #dc2626;
      }
      .casper-breach-secondary {
        background: rgba(255, 255, 255, 0.2);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.3);
      }
      .casper-breach-btn:hover {
        transform: translateY(-1px);
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
    `;
    document.head.appendChild(style);
    
    alert.querySelector('#casperOpenVault').addEventListener('click', () => {
      // Safari can't open new tabs from content scripts
      console.log('Open CASPER vault requested');
      alert.remove();
      style.remove();
    });
    
    alert.querySelector('#casperDismiss').addEventListener('click', () => {
      alert.remove();
      style.remove();
    });
    
    document.body.appendChild(alert);
  }

  /**
   * Monitor general security events
   */
  monitorSecurityEvents() {
    this.monitorConsoleErrors();
    this.monitorNetworkActivity();
    this.monitorDOMChanges();
  }

  /**
   * Monitor console errors for security issues
   */
  monitorConsoleErrors() {
    const originalError = console.error;
    console.error = (...args) => {
      const message = args.join(' ').toLowerCase();
      const securityKeywords = ['csp', 'cors', 'mixed content', 'insecure', 'certificate'];
      
      if (securityKeywords.some(keyword => message.includes(keyword))) {
        this.logSecurityEvent({
          type: 'security_error',
          timestamp: Date.now(),
          url: window.location.href,
          message: args.join(' ')
        });
      }
      
      originalError.apply(console, args);
    };
  }

  /**
   * Monitor network activity
   */
  monitorNetworkActivity() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = args[0];
      
      if (typeof url === 'string' && this.isSuspiciousUrl(url)) {
        this.logSecurityEvent({
          type: 'suspicious_request',
          timestamp: Date.now(),
          url: window.location.href,
          requestUrl: url
        });
      }
      
      return originalFetch.apply(window, args);
    };
  }

  /**
   * Check if URL is suspicious
   */
  isSuspiciousUrl(url) {
    const suspiciousPatterns = [
      /data:.*base64/i,
      /javascript:/i,
      /vbscript:/i,
      /file:/i
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Monitor DOM changes for security issues
   */
  monitorDOMChanges() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'SCRIPT' && this.isSuspiciousScript(node)) {
              this.logSecurityEvent({
                type: 'suspicious_script',
                timestamp: Date.now(),
                url: window.location.href,
                scriptSrc: node.src || 'inline',
                scriptContent: node.textContent ? node.textContent.substring(0, 100) : ''
              });
            }
          }
        });
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Check if script is suspicious
   */
  isSuspiciousScript(script) {
    if (!script.src && script.textContent) {
      const content = script.textContent.toLowerCase();
      const suspiciousKeywords = ['eval(', 'document.write', 'innerhtml', 'crypto', 'password'];
      return suspiciousKeywords.some(keyword => content.includes(keyword));
    }
    
    if (script.src) {
      return this.isSuspiciousUrl(script.src);
    }
    
    return false;
  }

  /**
   * Log security event
   */
  logSecurityEvent(event) {
    this.securityEvents.push(event);
    
    if (this.securityEvents.length > 100) {
      this.securityEvents.shift();
    }
    
    safariCompat.sendMessage({
      type: 'SECURITY_EVENT',
      event: event
    }, () => {});
  }

  /**
   * Setup message listener
   */
  setupMessageListener() {
    if (typeof safari !== 'undefined' && safari.extension) {
      safari.extension.addEventListener('message', (event) => {
        switch (event.message.type) {
          case 'GET_SECURITY_EVENTS':
            // Safari doesn't support sendResponse, so we send a new message
            safariCompat.sendMessage({
              type: 'SECURITY_EVENTS_RESPONSE',
              events: this.securityEvents
            }, () => {});
            break;
            
          case 'CLEAR_SECURITY_EVENTS':
            this.securityEvents = [];
            break;
        }
      });
    }
  }

  /**
   * Convert ArrayBuffer to base64
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    return this.arrayToBase64(bytes);
  }

  /**
   * Convert Uint8Array to base64
   */
  arrayToBase64(array) {
    return btoa(String.fromCharCode.apply(null, array));
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

// Initialize Safari page monitor
new CasperSafariPageMonitor();