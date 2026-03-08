class CasperAutofill {
  constructor() {
    this.forms = [];
    this.cachedSettings = null;
    this.lastScanAt = 0;
    this.lastPromptSignature = '';
    this.lastPromptAt = 0;
    this.init();
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.start(), { once: true });
    } else {
      this.start();
    }
  }

  start() {
    this.scanForms();
    this.observeMutations();
    this.listenForMessages();
    this.listenForDemoAuthEvents();
  }

  isDummyDemoSite() {
    return window.location.hostname === '127.0.0.1' && window.location.port === '8790';
  }

  scanForms() {
    this.forms = [];
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    passwordInputs.forEach((passwordField) => {
      const form = passwordField.closest('form') || document.body;
      const usernameField = this.findUsernameField(form, passwordField);
      if (!usernameField) return;

      const pair = { form, usernameField, passwordField };
      this.forms.push(pair);

      if (!form.querySelector('.casper-autofill-btn')) {
        this.injectAutofillButton(pair);
      }

      if (!form.dataset.casperBound) {
        form.dataset.casperBound = '1';
        if (!this.isDummyDemoSite()) {
          form.addEventListener('submit', () => this.captureSubmittedCredentials(pair, form), true);
          form.addEventListener('click', (event) => {
            const target = event.target;
            if (
              target instanceof HTMLElement &&
              target.closest('button[type="submit"], input[type="submit"], button[id*="login" i], button[class*="login" i]')
            ) {
              this.captureSubmittedCredentials(pair, form);
            }
          }, true);
        }
      }

      if (!passwordField.dataset.casperEnterBound) {
        passwordField.dataset.casperEnterBound = '1';
        if (!this.isDummyDemoSite()) {
          passwordField.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              this.captureSubmittedCredentials(pair, form);
            }
          });
        }
      }
    });

    if (this.forms.length > 0) {
      this.sendMessage({
        type: 'LOGIN_FORMS_DETECTED',
        url: window.location.href,
        count: this.forms.length,
      }).catch(() => {});
    }
  }

  findUsernameField(form, passwordField) {
    const selectors = [
      'input[type="email"]',
      'input[name*="user" i]',
      'input[name*="email" i]',
      'input[id*="user" i]',
      'input[id*="email" i]',
      'input[type="text"]',
    ];

    for (const selector of selectors) {
      const field = form.querySelector(selector);
      if (field && field !== passwordField) return field;
    }

    return null;
  }

  injectAutofillButton({ passwordField }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'casper-autofill-btn';
    btn.textContent = 'Fill with CASPER';
    btn.style.cssText = [
      'margin-top:8px',
      'padding:6px 10px',
      'border-radius:6px',
      'border:1px solid #0f766e',
      'background:#14b8a6',
      'color:#fff',
      'font-size:12px',
      'cursor:pointer',
      'z-index:2147483647',
      'position:relative',
    ].join(';');

    btn.addEventListener('click', () => this.handleAutofillRequest());
    passwordField.insertAdjacentElement('afterend', btn);
  }

  async handleAutofillRequest() {
    try {
      const result = await this.sendMessage({ type: 'AUTOFILL_REQUEST', url: window.location.href });
      if (!result.success || !result.credential) {
        this.notify(result.message || 'No credentials found', 'warn');
        return;
      }

      for (const pair of this.forms) {
        pair.usernameField.value = result.credential.username || '';
        pair.passwordField.value = result.credential.password || '';
        pair.usernameField.dispatchEvent(new Event('input', { bubbles: true }));
        pair.passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        pair.usernameField.dispatchEvent(new Event('change', { bubbles: true }));
        pair.passwordField.dispatchEvent(new Event('change', { bubbles: true }));
      }

      this.notify('Credentials filled', 'ok');
    } catch (error) {
      if (this.isContextInvalidatedError(error)) {
        this.notify('Extension updated. Reload this tab, then try autofill again.', 'warn');
        return;
      }
      this.notify(`Autofill failed: ${error.message}`, 'err');
    }
  }

  async captureSubmittedCredentials(pair, form) {
    const { username, password } = this.extractSubmittedCredentials(pair, form);
    if (!username || !password) return;
    if (!this.shouldPrompt(username, password)) return;
    await this.maybePromptAndSaveCredential(username, password);
  }

  async maybePromptAndSaveCredential(username, password) {
    try {
      const settings = await this.getSettings();
      if (settings && settings.savePrompts === false) return;

      const current = await this.sendMessage({ type: 'GET_PASSWORDS', url: window.location.href });
      if (current?.requiresUnlock) {
        this.notify('Unlock CASPER to save this password', 'warn');
        return;
      }
      const existing = current?.success
        ? (current.data || []).find((row) => row.username === username)
        : null;
      if (existing && String(existing.password || '') === String(password || '')) {
        return;
      }

      if (existing) {
        const shouldUpdate = window.confirm(
          `A saved credential already exists for ${window.location.hostname} and ${username}.\nUpdate password?`
        );
        if (!shouldUpdate) return;
      } else {
        const shouldSave = window.confirm(`Save password for ${window.location.hostname}?`);
        if (!shouldSave) return;
      }
      const saveResult = await this.sendMessage({
        type: 'SAVE_CREDENTIALS',
        credentials: {
          username,
          password,
          url: window.location.href,
          title: document.title,
        },
      });
      if (!saveResult?.success) {
        this.notify(saveResult?.message || 'Could not save credentials', 'err');
        return;
      }
      this.notify(existing ? 'Password updated in CASPER' : 'Password saved to CASPER', 'ok');
      this.lastPromptSignature = `${window.location.hostname}|${username}|${password}`;
      this.lastPromptAt = Date.now();
    } catch (error) {
      if (this.isContextInvalidatedError(error)) {
        this.notify('Extension updated. Reload this tab, then retry save.', 'warn');
        return;
      }
      this.notify(`Save prompt failed: ${error.message}`, 'err');
    }
  }

  listenForDemoAuthEvents() {
    window.addEventListener('casper-auth-success', (event) => {
      const detail = event?.detail || {};
      const username = String(detail.username || '').trim();
      const password = String(detail.password || '');
      if (!username || !password) return;
      if (!this.shouldPrompt(username, password)) return;
      this.maybePromptAndSaveCredential(username, password).catch(() => {});
    });

    window.addEventListener('casper-auth-failure', (event) => {
      const detail = event?.detail || {};
      this.sendMessage({
        type: 'SECURITY_EVENT',
        event: {
          type: 'auth_failure',
          service: detail.service_name || window.location.hostname,
          username: detail.username || '',
          reason: detail.reason || 'invalid_credentials',
          source: 'dummy_site',
          at: Date.now(),
        },
      }).catch(() => {});
    });
  }

  shouldPrompt(username, password) {
    const signature = `${window.location.hostname}|${username}|${password}`;
    const nowTs = Date.now();
    if (this.lastPromptSignature === signature && nowTs - this.lastPromptAt < 20000) {
      return false;
    }
    return true;
  }

  extractSubmittedCredentials(pair, form) {
    const usernameFromPair = pair?.usernameField?.value?.trim() || '';
    const passwordFromPair = pair?.passwordField?.value || '';

    if (usernameFromPair && passwordFromPair) {
      return { username: usernameFromPair, password: passwordFromPair };
    }

    const passwordField =
      form?.querySelector('input[type="password"]') ||
      document.querySelector('input[type="password"]');
    const usernameField =
      form?.querySelector('input[type="email"], input[name*="user" i], input[name*="email" i], input[type="text"]') ||
      document.querySelector('input[type="email"], input[name*="user" i], input[name*="email" i], input[type="text"]');

    return {
      username: usernameField?.value?.trim() || '',
      password: passwordField?.value || '',
    };
  }

  async getSettings() {
    const nowTs = Date.now();
    if (this.cachedSettings && nowTs - this.lastScanAt < 15000) {
      return this.cachedSettings;
    }
    try {
      const response = await this.sendMessage({ type: 'GET_SETTINGS' });
      if (response.success) {
        this.cachedSettings = response.data || {};
        this.lastScanAt = nowTs;
      }
    } catch {
      // Ignore settings fetch errors in page context.
    }
    return this.cachedSettings || {};
  }

  observeMutations() {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if ([...record.addedNodes].some((n) => n.nodeType === Node.ELEMENT_NODE)) {
          this.scanForms();
          break;
        }
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  listenForMessages() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'FILL_CREDENTIALS' && message.credential) {
        for (const pair of this.forms) {
          pair.usernameField.value = message.credential.username || '';
          pair.passwordField.value = message.credential.password || '';
        }
        sendResponse({ success: true });
        return;
      }
      sendResponse({ success: false });
    });
  }

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

  isContextInvalidatedError(error) {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('extension context invalidated') || msg.includes('context invalidated');
  }

  notify(text, kind) {
    const color = kind === 'ok' ? '#047857' : kind === 'warn' ? '#b45309' : '#b91c1c';
    const node = document.createElement('div');
    node.textContent = text;
    node.style.cssText = [
      'position:fixed',
      'top:16px',
      'right:16px',
      'z-index:2147483647',
      `background:${color}`,
      'color:#fff',
      'padding:10px 12px',
      'border-radius:8px',
      'font:13px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif',
      'box-shadow:0 8px 20px rgba(0,0,0,.25)',
      'max-width:280px',
    ].join(';');
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 3000);
  }
}

new CasperAutofill();
