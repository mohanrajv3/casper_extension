/**
 * CASPER Content Script - Page Monitor
 * Monitors page for security events and breach detection
 */

class CasperPageMonitor {
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
    // Intercept navigator.credentials.create calls
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

    // Intercept navigator.credentials.get calls
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
      
      // Check if this might be a trap key usage
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
      
      // Check for breach indicators in authentication
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
      // Extract public key if available
      let publicKey = null;
      
      if (credential.response && credential.response.publicKey) {
        publicKey = new Uint8Array(credential.response.publicKey);
      } else if (credential.response && credential.response.authenticatorData) {
        // Try to extract public key from authenticator data
        publicKey = this.extractPublicKeyFromAuthData(credential.response.authenticatorData);
      }
      
      if (publicKey) {
        // Send to background for breach detection
        const response = await this.sendMessage({
          type: 'CHECK_BREACH',
          publicKey: this.arrayToBase64(publicKey),
          url: window.location.href,
          credentialId: credential.id
        });
        
        if (response.success && response.breach) {
          await this.handleBreachDetection(response);
        }
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
      // This is a simplified extraction - real implementation would need
      // proper CBOR parsing of the authenticator data
      const dataView = new DataView(authData);
      
      // Skip RP ID hash (32 bytes) and flags (1 byte) and counter (4 bytes)
      let offset = 37;
      
      // Check if attested credential data is present
      const flags = dataView.getUint8(32);
      const attestedCredentialDataIncluded = (flags & 0x40) !== 0;
      
      if (attestedCredentialDataIncluded) {
        // Skip AAGUID (16 bytes)
        offset += 16;
        
        // Get credential ID length (2 bytes)
        const credIdLength = dataView.getUint16(offset);
        offset += 2;
        
        // Skip credential ID
        offset += credIdLength;
        
        // The rest should be the public key in CBOR format
        // For simplicity, we'll return a portion of the data
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
    // Show immediate warning to user
    this.showBreachAlert(breachInfo);
    
    // Log critical security event
    const event = {
      type: 'breach_detected',
      timestamp: Date.now(),
      url: window.location.href,
      severity: breachInfo.severity || 'CRITICAL',
      reason: breachInfo.reason || 'Unknown'
    };
    
    this.logSecurityEvent(event);
    
    // Notify background
    await this.sendMessage({
      type: 'BREACH_DETECTED',
      event: event,
      breachInfo: breachInfo
    });
  }

  /**
   * Show breach alert to user
   */
  showBreachAlert(breachInfo) {
    // Create prominent breach warning
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
    
    // Style the alert
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
    
    // Add internal styles
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
    
    // Add event listeners
    alert.querySelector('#casperOpenVault').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_VAULT' });
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
    // Monitor for suspicious JavaScript execution
    this.monitorConsoleErrors();
    
    // Monitor for unusual network requests
    this.monitorNetworkActivity();
    
    // Monitor for DOM manipulation
    this.monitorDOMChanges();
  }

  /**
   * Monitor console errors for security issues
   */
  monitorConsoleErrors() {
    const originalError = console.error;
    console.error = (...args) => {
      // Check for security-related errors
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
    // Monitor fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = args[0];
      
      // Check for suspicious requests
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
            // Check for suspicious script injections
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
    // Check for inline scripts with suspicious content
    if (!script.src && script.textContent) {
      const content = script.textContent.toLowerCase();
      const suspiciousKeywords = ['eval(', 'document.write', 'innerhtml', 'crypto', 'password'];
      return suspiciousKeywords.some(keyword => content.includes(keyword));
    }
    
    // Check for suspicious external scripts
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
    
    // Keep only last 100 events
    if (this.securityEvents.length > 100) {
      this.securityEvents.shift();
    }
    
    // Send to background for processing
    this.sendMessage({
      type: 'SECURITY_EVENT',
      event: event
    });
  }

  /**
   * Setup message listener
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'GET_SECURITY_EVENTS':
          sendResponse({ events: this.securityEvents });
          break;
          
        case 'CLEAR_SECURITY_EVENTS':
          this.securityEvents = [];
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ success: false, message: 'Unknown message type' });
      }
    });
  }

  /**
   * Send message to background
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

// Initialize page monitor
new CasperPageMonitor();