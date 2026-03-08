class CasperVault {
  constructor() {
    this.currentSection = 'passwords';
    this.passwords = [];
    this.otpEntries = [];
    this.searchQuery = '';
    this.otpSearch = '';
    this.refreshTimer = null;
    this.securityTimer = null;
    this.securityLoadBusy = false;
    this.selectedPasswordId = null;
    this.editingPasswordId = null;
    this.settings = {};
    this.authState = { failedUnlocks: 0, lockoutUntil: 0, isLockedOut: false };

    this.init();
  }

  async init() {
    try {
      const status = await this.sendMessage({ type: 'VAULT_STATUS' });
      if (!status.vaultExists || !status.isUnlocked) {
        window.location.href = chrome.runtime.getURL('popup/popup.html');
        return;
      }

      this.updateHeader(status);
      this.bindEvents();
      await this.loadSettings();
      this.switchSection('passwords');
      this.startOtpRefresh();
    } catch (error) {
      this.toast(`Failed to initialize vault: ${error.message}`, 'error');
    }
  }

  bindEvents() {
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        const section = item.dataset.section;
        if (section) this.switchSection(section);
      });
    });

    document.getElementById('lockVault')?.addEventListener('click', () => this.lockVault());

    document.getElementById('passwordSearch')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.renderPasswords();
    });

    document.getElementById('passkeySearch')?.addEventListener('input', (e) => {
      this.otpSearch = e.target.value.trim().toLowerCase();
      this.renderOtpAccounts();
    });

    document.getElementById('addPasswordBtn')?.addEventListener('click', () => this.showModal());
    document.getElementById('addPasskeyBtn')?.addEventListener('click', () => this.addOtpFlow());

    document.getElementById('closeModal')?.addEventListener('click', () => this.hideModal());
    document.getElementById('cancelModal')?.addEventListener('click', () => this.hideModal());
    document.getElementById('saveModal')?.addEventListener('click', () => this.savePasswordFromModal());

    document.getElementById('generateModalPassword')?.addEventListener('click', () => {
      document.getElementById('modalPassword').value = this.makePassword();
    });

    document.getElementById('toggleModalPassword')?.addEventListener('click', () => {
      const input = document.getElementById('modalPassword');
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.hideModal();
    });

    document.getElementById('closeDetails')?.addEventListener('click', () => this.hideDetails());
    document.getElementById('refreshPasswordBtn')?.addEventListener('click', () => {
      document.getElementById('generatedPassword').value = this.makePassword();
    });

    document.getElementById('copyPasswordBtn')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(document.getElementById('generatedPassword').value || '');
      this.toast('Generated password copied', 'success');
    });

    document.getElementById('passwordLength')?.addEventListener('input', (e) => {
      document.getElementById('lengthValue').textContent = e.target.value;
      document.getElementById('generatedPassword').value = this.makePassword();
    });

    ['includeUppercase', 'includeLowercase', 'includeNumbers', 'includeSymbols'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        document.getElementById('generatedPassword').value = this.makePassword();
      });
    });

    document.getElementById('changePinBtn')?.addEventListener('click', () => {
      this.toast('PIN change requires vault migration; not enabled in this build.', 'info');
    });
    document.getElementById('breachTestBtn')?.addEventListener('click', () => this.triggerBreachTest());
    document.getElementById('checkBreachNowBtn')?.addEventListener('click', () => this.checkBreachNow());
    document.getElementById('openGuidelinesBtn')?.addEventListener('click', () => this.openGuidelines());
    document.getElementById('viewBreachDetailsBtn')?.addEventListener('click', () => this.viewBreachDetails());
    document.getElementById('showDecoysDevBtn')?.addEventListener('click', () => this.showDecoysDev());
    document.getElementById('clearAllAlertsBtn')?.addEventListener('click', () => this.clearAllAlerts());
    document.getElementById('clearSiteAlertsBtn')?.addEventListener('click', () => this.clearSiteAlerts());

    document.getElementById('exportVaultBtn')?.addEventListener('click', () => this.exportVault());
    document.getElementById('viewLogsBtn')?.addEventListener('click', () => this.viewLogs());
    document.getElementById('testEmailBtn')?.addEventListener('click', () => this.sendTestEmail());
    document.getElementById('viewRecoveryCodesBtn')?.addEventListener('click', () => this.viewRecoveryCodes());
    document.getElementById('regenerateRecoveryCodesBtn')?.addEventListener('click', () => this.regenerateRecoveryCodes());
    document.getElementById('closeBreachModal')?.addEventListener('click', () => this.closeBreachDetailsModal());
    document.getElementById('closeBreachModalFooter')?.addEventListener('click', () => this.closeBreachDetailsModal());
    document.getElementById('breachModalOverlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeBreachDetailsModal();
    });
    document.getElementById('closeDecoyModal')?.addEventListener('click', () => this.closeDecoyDetailsModal());
    document.getElementById('closeDecoyModalFooter')?.addEventListener('click', () => this.closeDecoyDetailsModal());
    document.getElementById('decoyModalOverlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeDecoyDetailsModal();
    });

    const saveSettings = () => this.saveSettings();
    [
      'autoLockTime',
      'breachAlerts',
      'autoFillEnabled',
      'savePrompts',
      'syncEnabled',
      'maxUnlockAttempts',
      'lockoutMinutes',
      'otpDefaultPeriod',
      'otpGraceWindows',
      'deceptionEnabled',
      'honeyServerUrl',
      'honeyApiKey',
      'decoyCount',
      'pollIntervalSeconds',
      'mailToEmail',
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', saveSettings);
    });
  }

  async switchSection(section) {
    const targetId = `${section}Section`;
    const targetEl = document.getElementById(targetId);

    if (!targetEl) {
      section = 'passwords';
    }

    this.currentSection = section;

    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.section === section);
    });

    document.querySelectorAll('.content-section').forEach((s) => {
      s.classList.remove('active');
    });

    document.getElementById(`${section}Section`)?.classList.add('active');

    if (section === 'passwords') await this.loadPasswords();
    if (section === 'passkeys') await this.loadOtpAccounts();
    if (section === 'security') {
      await this.loadSecurity();
      this.startSecurityRefresh();
    } else {
      this.stopSecurityRefresh();
    }
    if (section === 'generator') {
      document.getElementById('generatedPassword').value = this.makePassword();
    }
  }

  updateHeader(status) {
    document.getElementById('passwordCount').textContent = status.entryCount || 0;
    document.getElementById('totalPasswords').textContent = status.entryCount || 0;
    document.getElementById('vaultStatus').querySelector('.status-icon').textContent = status.isUnlocked ? '🔓' : '🔒';
    document.getElementById('vaultStatus').querySelector('.status-text').textContent = status.isUnlocked ? 'Unlocked' : 'Locked';
    document.getElementById('lastSync').textContent = new Date().toLocaleTimeString();
  }

  async loadPasswords() {
    const response = await this.sendMessage({ type: 'GET_ALL_PASSWORDS' });
    if (!response.success) {
      if (response.requiresUnlock) return this.handleLockedSession();
      this.toast(response.message || 'Failed to load passwords', 'error');
      return;
    }

    this.passwords = response.data || [];
    document.getElementById('passwordCount').textContent = this.passwords.length;
    document.getElementById('totalPasswords').textContent = this.passwords.length;
    this.renderPasswords();
  }

  renderPasswords() {
    const grid = document.getElementById('passwordsGrid');
    grid.innerHTML = '';

    const filtered = this.passwords.filter((entry) => {
      const hay = `${entry.title} ${entry.username} ${entry.url}`.toLowerCase();
      return hay.includes(this.searchQuery);
    });

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<span class="empty-icon">🔑</span><h3>No Passwords</h3><p>Add a password to start autofill.</p>';
      grid.appendChild(empty);
      return;
    }

    filtered.forEach((entry) => {
      const card = document.createElement('div');
      card.className = 'password-item';
      card.tabIndex = 0;

      const header = document.createElement('div');
      header.className = 'password-header';

      const favicon = document.createElement('div');
      favicon.className = 'password-favicon';
      favicon.textContent = (entry.domain || entry.title || '?').charAt(0).toUpperCase();

      const title = document.createElement('div');
      title.className = 'password-title';
      title.textContent = entry.title || entry.domain || 'Login';

      const actions = document.createElement('div');
      actions.className = 'password-actions';

      const copyBtn = this.iconButton('📋', async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(entry.password);
        this.toast('Password copied', 'success');
      });

      const editBtn = this.iconButton('✏️', async (e) => {
        e.stopPropagation();
        const verified = await this.verifySensitiveAction('edit_password');
        if (!verified) return;
        this.showModal(entry);
      });

      const deleteBtn = this.iconButton('🗑️', async (e) => {
        e.stopPropagation();
        if (!window.confirm('Delete this password entry?')) return;
        const verified = await this.verifySensitiveAction('delete_password');
        if (!verified) return;
        const del = await this.sendMessage({ type: 'DELETE_PASSWORD', id: entry.id });
        if (!del.success) {
          this.toast(del.message || 'Delete failed', 'error');
          return;
        }
        this.toast('Password deleted', 'success');
        await this.loadPasswords();
        this.hideDetails();
      });

      actions.appendChild(copyBtn);
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      header.appendChild(favicon);
      header.appendChild(title);
      header.appendChild(actions);

      const info = document.createElement('div');
      info.className = 'password-info';
      const user = document.createElement('div');
      user.className = 'password-username';
      user.textContent = entry.username;
      const url = document.createElement('div');
      url.className = 'password-url';
      url.textContent = entry.url;
      info.appendChild(user);
      info.appendChild(url);

      card.appendChild(header);
      card.appendChild(info);
      card.addEventListener('click', () => this.showDetails(entry));
      card.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.showDetails(entry);
      });
      grid.appendChild(card);
    });
  }

  iconButton(label, onClick) {
    const btn = document.createElement('button');
    btn.className = 'icon-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  showDetails(entry) {
    this.selectedPasswordId = entry.id;
    const panel = document.getElementById('detailsPanel');
    const title = document.getElementById('detailsTitle');
    const content = document.getElementById('detailsContent');

    title.textContent = entry.title || 'Password Entry';
    content.innerHTML = '';

    const fields = [
      ['Website', entry.url],
      ['Username', entry.username],
      ['Password', '••••••••••••'],
      ['Created', new Date(entry.createdAt || entry.created || Date.now()).toLocaleString()],
      ['Last Used', entry.lastUsedAt ? new Date(entry.lastUsedAt).toLocaleString() : 'Never'],
    ];

    fields.forEach(([label, value], idx) => {
      const row = document.createElement('div');
      row.className = 'detail-item';

      const left = document.createElement('label');
      left.textContent = label;
      const right = document.createElement('div');
      right.className = 'detail-value';

      const span = document.createElement('span');
      span.textContent = value;
      right.appendChild(span);

      if (idx === 1) {
        right.appendChild(this.iconButton('📋', async () => {
          await navigator.clipboard.writeText(entry.username);
          this.toast('Username copied', 'success');
        }));
      }

      if (idx === 2) {
        right.appendChild(this.iconButton('📋', async () => {
          await navigator.clipboard.writeText(entry.password);
          this.toast('Password copied', 'success');
        }));

        right.appendChild(this.iconButton('👁️', () => {
          span.textContent = span.textContent.startsWith('•') ? entry.password : '••••••••••••';
        }));
      }

      row.appendChild(left);
      row.appendChild(right);
      content.appendChild(row);
    });

    const actions = document.createElement('div');
    actions.className = 'detail-actions';
    const edit = document.createElement('button');
    edit.className = 'primary-btn';
    edit.textContent = 'Edit Password';
    edit.addEventListener('click', async () => {
      const verified = await this.verifySensitiveAction('edit_password');
      if (!verified) return;
      this.showModal(entry);
    });
    actions.appendChild(edit);
    content.appendChild(actions);

    panel.classList.add('active');
  }

  hideDetails() {
    this.selectedPasswordId = null;
    document.getElementById('detailsPanel').classList.remove('active');
  }

  showModal(existing = null) {
    document.getElementById('modalOverlay').style.display = 'flex';
    this.editingPasswordId = existing?.id || null;
    document.getElementById('addPasswordModal').querySelector('h3').textContent = existing ? 'Edit Password' : 'Add Password';
    document.getElementById('saveModal').textContent = existing ? 'Update Password' : 'Save Password';
    if (existing) {
      document.getElementById('modalUrl').value = existing.url || '';
      document.getElementById('modalTitle').value = existing.title || '';
      document.getElementById('modalUsername').value = existing.username || '';
      document.getElementById('modalPassword').value = existing.password || '';
      document.getElementById('modalNotes').value = existing.notes || '';
    }
    document.getElementById('modalUrl').focus();
  }

  hideModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    this.editingPasswordId = null;
    document.getElementById('addPasswordModal').querySelector('h3').textContent = 'Add Password';
    document.getElementById('saveModal').textContent = 'Save Password';
    ['modalUrl', 'modalTitle', 'modalUsername', 'modalPassword', 'modalNotes'].forEach((id) => {
      document.getElementById(id).value = '';
    });
  }

  async savePasswordFromModal() {
    const wasEditing = Boolean(this.editingPasswordId);
    const entry = {
      url: document.getElementById('modalUrl').value.trim(),
      title: document.getElementById('modalTitle').value.trim(),
      username: document.getElementById('modalUsername').value.trim(),
      password: document.getElementById('modalPassword').value,
      notes: document.getElementById('modalNotes').value,
    };

    const validation = this.validatePasswordEntry(entry);
    if (!validation.ok) {
      this.toast(validation.message, 'error');
      return;
    }

    let result;
    if (this.editingPasswordId) {
      result = await this.sendMessage({
        type: 'UPDATE_PASSWORD',
        id: this.editingPasswordId,
        updates: entry,
      });
    } else {
      result = await this.sendMessage({ type: 'ADD_PASSWORD', entry });
    }

    if (result.requiresVerification) {
      const verified = await this.verifySensitiveAction('edit_password');
      if (!verified) return;
      result = await this.sendMessage({
        type: 'UPDATE_PASSWORD',
        id: this.editingPasswordId,
        updates: entry,
      });
    }

    if (!result.success) {
      this.toast(result.message || 'Failed to save password', 'error');
      return;
    }

    this.hideModal();
    this.toast(wasEditing ? 'Password updated' : 'Password saved', 'success');
    await this.loadPasswords();
  }

  validatePasswordEntry(entry) {
    if (!entry.url || !entry.username || !entry.password) {
      return { ok: false, message: 'URL, username and password are required' };
    }
    try {
      const parsed = new URL(entry.url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { ok: false, message: 'URL must be http or https' };
      }
    } catch {
      return { ok: false, message: 'URL format is invalid' };
    }

    if (entry.username.length < 2) {
      return { ok: false, message: 'Username is too short' };
    }
    if (entry.password.length < 4) {
      return { ok: false, message: 'Password is too short' };
    }
    if (entry.password.length > 512) {
      return { ok: false, message: 'Password is too long' };
    }
    return { ok: true };
  }

  async verifySensitiveAction(reason) {
    const pin = window.prompt('Security verification: enter your CASPER PIN');
    if (!pin) return false;
    const response = await this.sendMessage({ type: 'VERIFY_PIN', pin, reason });
    if (!response.success) {
      this.toast(response.message || 'Verification failed', 'error');
      return false;
    }
    return true;
  }

  makePassword() {
    const length = Number(document.getElementById('passwordLength').value || 16);
    let chars = '';
    if (document.getElementById('includeUppercase').checked) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (document.getElementById('includeLowercase').checked) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (document.getElementById('includeNumbers').checked) chars += '0123456789';
    if (document.getElementById('includeSymbols').checked) chars += '!@#$%^&*()_+-=[]{};:,.?';
    if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz0123456789';

    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    let out = '';
    for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length];
    return out;
  }

  async loadOtpAccounts() {
    const response = await this.sendMessage({ type: 'GET_OTP_CODES' });
    if (!response.success) {
      if (response.requiresUnlock) return this.handleLockedSession();
      this.toast(response.message || 'Failed to load OTP accounts', 'error');
      return;
    }

    this.otpEntries = response.data || [];
    this.renderOtpAccounts();
  }

  renderOtpAccounts() {
    const grid = document.getElementById('passkeysGrid');
    grid.innerHTML = '';

    const list = this.otpEntries.filter((a) => {
      const hay = `${a.issuer} ${a.label} ${a.type}`.toLowerCase();
      return hay.includes(this.otpSearch);
    });

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<span class="empty-icon">⏱️</span><h3>No OTP Accounts</h3><p>Add accounts from QR/otpauth data.</p>';
      grid.appendChild(empty);
      return;
    }

    list.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'password-item';

      const header = document.createElement('div');
      header.className = 'password-header';

      const icon = document.createElement('div');
      icon.className = 'password-favicon';
      icon.textContent = item.type === 'hotp' ? 'H' : 'T';

      const title = document.createElement('div');
      title.className = 'password-title';
      title.textContent = `${item.issuer} (${item.label})`;

      const actions = document.createElement('div');
      actions.className = 'password-actions';
      actions.appendChild(this.iconButton('📋', async () => {
        await navigator.clipboard.writeText(item.code);
        this.toast('OTP copied', 'success');
      }));
      actions.appendChild(this.iconButton('✅', async () => {
        const input = window.prompt('Enter OTP code to verify:');
        if (!input) return;
        const verify = await this.sendMessage({ type: 'VERIFY_OTP_CODE', id: item.id, code: input });
        if (!verify.success) {
          this.toast(verify.message || 'OTP verification failed', 'error');
          return;
        }
        this.toast(verify.message || 'OTP verified', 'success');
      }));

      if (item.type === 'hotp') {
        actions.appendChild(this.iconButton('➕', async () => {
          const inc = await this.sendMessage({ type: 'INCREMENT_HOTP', id: item.id });
          if (!inc.success) {
            this.toast(inc.message || 'Failed to increment HOTP', 'error');
            return;
          }
          await this.loadOtpAccounts();
        }));
      }

      actions.appendChild(this.iconButton('🗑️', async () => {
        if (!window.confirm('Delete this OTP account?')) return;
        const del = await this.sendMessage({ type: 'DELETE_OTP_ACCOUNT', id: item.id });
        if (!del.success) {
          this.toast(del.message || 'Failed to delete OTP', 'error');
          return;
        }
        await this.loadOtpAccounts();
      }));

      header.appendChild(icon);
      header.appendChild(title);
      header.appendChild(actions);

      const info = document.createElement('div');
      info.className = 'password-info';
      const code = document.createElement('div');
      code.className = 'password-username';
      code.textContent = `Code: ${item.code}`;
      const meta = document.createElement('div');
      meta.className = 'password-url';
      meta.textContent = item.type === 'totp' ? `Refresh in ${item.remaining}s` : `Counter: ${item.counter}`;

      info.appendChild(code);
      info.appendChild(meta);
      card.appendChild(header);
      card.appendChild(info);
      grid.appendChild(card);
    });
  }

  async addOtpFlow() {
    const otpauthUrl = window.prompt('Paste otpauth:// URI (or leave empty for manual setup):', '');
    if (otpauthUrl === null) return;

    let account = {};

    if (otpauthUrl.trim()) {
      account.otpauthUrl = otpauthUrl.trim();
    } else {
      const issuer = window.prompt('Issuer (e.g. GitHub):', '');
      if (issuer === null) return;
      const label = window.prompt('Account label (e.g. you@example.com):', '');
      if (label === null) return;
      const secret = window.prompt('Secret (Base32):', '');
      if (!secret) return;
      const type = (window.prompt('Type: totp or hotp', 'totp') || 'totp').toLowerCase();
      const defaultPeriod = Number(this.settings?.auth?.otpDefaultPeriod || 30) === 60 ? 60 : 30;

      account = {
        issuer: issuer.trim() || 'Unknown',
        label: label.trim() || 'Account',
        secret: secret.trim(),
        type: type === 'hotp' ? 'hotp' : 'totp',
        digits: 6,
        period: defaultPeriod,
        algorithm: 'SHA1',
        counter: 0,
      };
    }

    const result = await this.sendMessage({ type: 'ADD_OTP_ACCOUNT', account });
    if (!result.success) {
      this.toast(result.message || 'Failed to add OTP account', 'error');
      return;
    }

    this.toast('OTP account added', 'success');
    await this.loadOtpAccounts();
  }

  startOtpRefresh() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(async () => {
      if (this.currentSection === 'passkeys') {
        try {
          await this.loadOtpAccounts();
        } catch {
          // Keep interval alive even if runtime is temporarily unavailable.
        }
      }
    }, 1000);
  }

  startSecurityRefresh() {
    this.stopSecurityRefresh();
    this.securityTimer = setInterval(() => {
      this.updateAuthStatusCard();
      if (this.securityLoadBusy) return;
      if (this.currentSection !== 'security') return;
      this.securityLoadBusy = true;
      this.loadSecurity()
        .catch(() => {})
        .finally(() => {
          this.securityLoadBusy = false;
        });
    }, 4000);
  }

  stopSecurityRefresh() {
    if (this.securityTimer) {
      clearInterval(this.securityTimer);
      this.securityTimer = null;
    }
  }

  updateAuthStatusCard() {
    const indicator = document.getElementById('authStatusIndicator');
    const text = document.getElementById('authStatusText');
    const subtext = document.getElementById('authStatusSubtext');
    const attemptsLeft = document.getElementById('authAttemptsLeft');
    const countdown = document.getElementById('authLockoutCountdown');
    if (!indicator || !text || !subtext || !attemptsLeft || !countdown) return;

    const maxAttempts = Number(this.settings?.auth?.maxUnlockAttempts || 5);
    const failed = Number(this.authState?.failedUnlocks || 0);
    const remainingAttempts = Math.max(0, maxAttempts - failed);
    attemptsLeft.textContent = String(remainingAttempts);

    const lockoutUntil = Number(this.authState?.lockoutUntil || 0);
    const remainingMs = Math.max(0, lockoutUntil - Date.now());
    const lockoutSec = Math.ceil(remainingMs / 1000);
    countdown.textContent = lockoutSec > 0 ? `${lockoutSec}s` : '0s';

    if (lockoutSec > 0) {
      indicator.className = 'status-indicator error';
      text.textContent = 'Lockout active';
      subtext.textContent = 'Too many failed attempts. Wait for lockout to expire.';
      return;
    }
    if (remainingAttempts <= 2) {
      indicator.className = 'status-indicator warning';
      text.textContent = 'Caution: low attempts left';
      subtext.textContent = 'Authentication active, but failed attempts are near threshold.';
      return;
    }
    indicator.className = 'status-indicator';
    text.textContent = 'Authentication healthy';
    subtext.textContent = 'No lockout active';
  }

  async loadSecurity() {
    const [response, decoyStatus, authStatus, siteSummary] = await Promise.all([
      this.sendMessage({ type: 'GET_SECURITY_EVENTS' }),
      this.sendMessage({ type: 'GET_DECOY_STATUS' }),
      this.sendMessage({ type: 'GET_AUTH_STATUS' }),
      this.sendMessage({ type: 'GET_SITE_SECURITY_SUMMARY' }),
    ]);
    if (!response.success) {
      if (response.requiresUnlock) return this.handleLockedSession();
      this.toast(response.message || 'Failed to load security data', 'error');
      return;
    }
    if (!decoyStatus.success && decoyStatus.requiresUnlock) return this.handleLockedSession();

    const breachCount = (response.data.breachAlerts || []).length;
    const breachIndicator = document.getElementById('breachStatusIndicator');
    const breachText = document.getElementById('breachStatusText');
    const breachSubtext = document.getElementById('breachStatusSubtext');
    if (breachIndicator) {
      breachIndicator.className = `status-indicator${breachCount > 0 ? ' error' : ''}`;
    }
    const latestAlerts = response.data.breachAlerts || [];
    const hasWrongPasswordWarning = latestAlerts.some((a) => a.type === 'breach_warning');
    if (breachText) {
      if (hasWrongPasswordWarning) {
        breachText.textContent = 'Wrong password attempt detected. Follow Security Response Guidelines.';
        breachText.classList.add('status-text-danger');
      } else {
        breachText.textContent = breachCount > 0 ? `${breachCount} breach alert${breachCount > 1 ? 's' : ''} detected` : 'No breaches detected';
        breachText.classList.toggle('status-text-danger', breachCount > 0);
      }
    }
    if (breachSubtext) {
      if (hasWrongPasswordWarning) {
        breachSubtext.textContent = 'Potential credential probing detected. Open the guide and complete immediate containment steps.';
      } else {
        breachSubtext.textContent =
          breachCount > 0
            ? 'Unauthorized decoy usage has been detected. Review security logs immediately.'
            : 'CASPER is actively monitoring for unauthorized access';
      }
    }

    const trapLabel = document.getElementById('trapKeyCount');
    if (trapLabel) {
      trapLabel.textContent = breachCount > 0 ? `${breachCount} breach alerts` : 'Trap key monitoring active';
    }
    const decoyLabel = document.getElementById('decoyStatusText');
    if (decoyLabel && decoyStatus.success) {
      const d = decoyStatus.data || {};
      decoyLabel.textContent = `Decoys: ${d.monitoredDecoys}/${d.totalDecoys} monitored`;
    }
    const failedUnlocks = document.getElementById('failedUnlocks');
    if (failedUnlocks) {
      failedUnlocks.textContent = authStatus?.success ? String(authStatus.data?.failedUnlocks || 0) : String(response.data.failedUnlocks || 0);
    }
    if (authStatus?.success) {
      this.authState = authStatus.data || this.authState;
      this.updateAuthStatusCard();
    }
    this.renderSiteRiskSummary(siteSummary?.success ? (siteSummary.data || []) : []);
  }

  renderSiteRiskSummary(rows) {
    const root = document.getElementById('siteRiskSummary');
    if (!root) return;
    if (!rows.length) {
      root.innerHTML = '<p>No site-level security data yet.</p>';
      return;
    }
    root.innerHTML = '';
    rows.slice(0, 12).forEach((row) => {
      const node = document.createElement('div');
      node.className = 'site-risk-row';
      const updated = row.lastEventAt ? new Date(row.lastEventAt).toLocaleString() : 'N/A';
      node.innerHTML = `
        <div class="domain">${row.domain}</div>
        <div class="meta">Credentials: ${row.credentials} | Decoys: ${row.monitoredDecoys}/${row.decoys}</div>
        <div class="meta">Breaches: ${row.breachAlerts} | Warnings: ${row.warningAlerts} | Last: ${updated}</div>
      `;
      root.appendChild(node);
    });
  }

  async loadSettings() {
    const response = await this.sendMessage({ type: 'GET_SETTINGS' });
    if (!response.success) {
      if (response.requiresUnlock) this.handleLockedSession();
      return;
    }
    const settings = response.data || {};
    this.settings = settings;
    this.applySettingsToForm(settings);
  }

  applySettingsToForm(settings) {
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value ?? '';
    };
    const setChecked = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.checked = Boolean(value);
    };

    const minutes = Number(settings.autoLockMinutes || 5);
    const autoLockSeconds = String(minutes * 60);
    if (document.getElementById('autoLockTime')) {
      document.getElementById('autoLockTime').value = autoLockSeconds;
    }
    setChecked('breachAlerts', settings.breachAlerts !== false);
    setChecked('autoFillEnabled', settings.autoFill !== false);
    setChecked('savePrompts', settings.savePrompts !== false);
    setChecked('syncEnabled', settings.syncEnabled !== false);
    setValue('maxUnlockAttempts', String(settings.auth?.maxUnlockAttempts || 5));
    setValue('lockoutMinutes', String(settings.auth?.lockoutMinutes || 5));
    setValue('otpDefaultPeriod', String(settings.auth?.otpDefaultPeriod || 30));
    setValue('otpGraceWindows', String(settings.auth?.otpGraceWindows || 1));
    setChecked('deceptionEnabled', settings.deception?.monitoringEnabled !== false);
    setValue('honeyServerUrl', settings.deception?.honeyServerUrl || '');
    setValue('honeyApiKey', settings.deception?.honeyApiKey || '');
    setValue('decoyCount', String(settings.deception?.decoyCount || 3));
    setValue('pollIntervalSeconds', String(settings.deception?.pollIntervalSeconds || 60));
    setValue('mailToEmail', settings.mailService?.toEmail || '');
  }

  async saveSettings() {
    const settings = {
      autoLockMinutes: Number(document.getElementById('autoLockTime').value || 5) / 60,
      breachAlerts: Boolean(document.getElementById('breachAlerts').checked),
      autoFill: Boolean(document.getElementById('autoFillEnabled').checked),
      savePrompts: Boolean(document.getElementById('savePrompts').checked),
      syncEnabled: Boolean(document.getElementById('syncEnabled').checked),
      auth: {
        maxUnlockAttempts: Number(document.getElementById('maxUnlockAttempts')?.value || 5),
        lockoutMinutes: Number(document.getElementById('lockoutMinutes')?.value || 5),
        otpDefaultPeriod: Number(document.getElementById('otpDefaultPeriod')?.value || 30),
        otpGraceWindows: Number(document.getElementById('otpGraceWindows')?.value || 1),
      },
      deception: {
        monitoringEnabled: Boolean(document.getElementById('deceptionEnabled').checked),
        honeyServerUrl: document.getElementById('honeyServerUrl')?.value?.trim() || '',
        honeyApiKey: document.getElementById('honeyApiKey')?.value?.trim() || '',
        decoyCount: Number(document.getElementById('decoyCount')?.value || 3),
        pollIntervalSeconds: Number(document.getElementById('pollIntervalSeconds')?.value || 60),
      },
      mailService: {
        toEmail: document.getElementById('mailToEmail')?.value?.trim() || '',
      },
    };

    if (
      settings.mailService.toEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.mailService.toEmail)
    ) {
      this.toast('Alert email format is invalid', 'error');
      return false;
    }

    const response = await this.sendMessage({ type: 'UPDATE_SETTINGS', settings });
    if (!response.success) {
      if (response.requiresUnlock) return this.handleLockedSession();
      this.toast(response.message || 'Failed to save settings', 'error');
      return false;
    }

    this.toast('Settings saved', 'success');
    return true;
  }

  async checkBreachNow() {
    const response = await this.sendMessage({ type: 'CHECK_BREACH_NOW' });
    if (!response.success) {
      if (response.requiresUnlock) return this.handleLockedSession();
      this.toast(response.message || 'Breach check failed', 'error');
      return;
    }
    if (response.breach) {
      const wrong = Number(response.authFailureCount || 0);
      const suffix = wrong > 0 ? ` | Wrong-password attempts: ${wrong}` : '';
      this.toast(`Breach detected (${response.eventsCount || 0} events)${suffix}`, 'error');
    } else {
      const existing = Number(response.totalBreachAlerts || 0);
      const wrong = Number(response.authFailureCount || 0);
      const warnings = Number(response.warningAlertsTotal || 0);
      if (existing > 0 || wrong > 0) {
        this.toast(
          `No new breach events. Existing alerts: ${existing}. Warning alerts: ${warnings}. New wrong-password attempts: ${wrong}`,
          'info'
        );
      } else {
        this.toast('No breach detected', 'success');
      }
    }
    await this.loadSecurity();
  }

  async sendTestEmail() {
    const saved = await this.saveSettings();
    if (!saved) return;
    const response = await this.sendMessage({ type: 'SEND_TEST_EMAIL' });
    if (!response.success) {
      if (response.requiresUnlock) return this.handleLockedSession();
      this.toast(response.message || 'Test email failed', 'error');
      return;
    }
    this.toast('Test email sent. Check inbox/spam.', 'success');
    if (response.details) {
      const detailText =
        typeof response.details === 'string'
          ? response.details
          : JSON.stringify(response.details, null, 2);
      window.alert(`Email service response:\n${detailText}`);
    }
  }

  async exportVault() {
    const result = await this.sendMessage({ type: 'EXPORT_VAULT' });
    if (!result.success) {
      this.toast(result.message || 'Export failed', 'error');
      return;
    }

    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `casper-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this.toast('Vault export downloaded', 'success');
  }

  async viewLogs() {
    const response = await this.sendMessage({ type: 'GET_SECURITY_EVENTS' });
    if (!response.success) {
      this.toast(response.message || 'Could not load logs', 'error');
      return;
    }

    const events = response.data.events || [];
    const top = events.slice(0, 20).map((e) => {
      const time = new Date(e.timestamp).toLocaleString();
      return `[${time}] ${e.type}: ${e.message}`;
    });

    window.alert(top.length ? top.join('\n') : 'No security events recorded yet.');
  }

  async viewBreachDetails() {
    const response = await this.sendMessage({ type: 'GET_SECURITY_EVENTS' });
    if (!response.success) {
      if (response.requiresUnlock) return this.handleLockedSession();
      this.toast(response.message || 'Could not load breach details', 'error');
      return;
    }
    const alerts = response.data?.breachAlerts || [];
    const summary = document.getElementById('breachDetailsSummary');
    const list = document.getElementById('breachDetailsList');
    const overlay = document.getElementById('breachModalOverlay');
    if (!summary || !list || !overlay) return;

    summary.textContent = alerts.length
      ? `Total alerts: ${alerts.length}. Showing latest ${Math.min(alerts.length, 50)}.`
      : 'No breach alerts recorded.';
    list.innerHTML = '';

    alerts.slice(0, 50).forEach((evt) => {
      const row = document.createElement('div');
      row.className = 'breach-row';
      const when = new Date(evt.timestamp || Date.now()).toLocaleString();
      const details = evt.details || {};
      row.innerHTML = `
        <div><strong>${evt.message || 'Breach alert'}</strong></div>
        <div><small>Time: ${when}</small></div>
        <div><small>Decoy ID: ${details.decoyId || 'N/A'}</small></div>
        <div><small>Service: ${details.service || details.url || 'N/A'}</small></div>
        <div><small>IP: ${details.ipAddress || 'N/A'}</small></div>
        <div><small>Source: ${details.source || 'N/A'}</small></div>
      `;
      list.appendChild(row);
    });

    overlay.style.display = 'flex';
  }

  closeBreachDetailsModal() {
    const overlay = document.getElementById('breachModalOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  closeDecoyDetailsModal() {
    const overlay = document.getElementById('decoyModalOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  openGuidelines() {
    window.open(chrome.runtime.getURL('vault/security-guidelines.html'), '_blank', 'noopener');
  }

  async clearAllAlerts() {
    if (!window.confirm('Clear all breach/warning alerts?')) return;
    const verified = await this.verifySensitiveAction('clear_all_alerts');
    if (!verified) return;
    const response = await this.sendMessage({ type: 'CLEAR_ALERTS' });
    if (!response.success) {
      this.toast(response.message || 'Failed to clear alerts', 'error');
      return;
    }
    this.toast(`Cleared ${response.cleared || 0} alerts`, 'success');
    await this.loadSecurity();
  }

  async clearSiteAlerts() {
    const site = window.prompt('Enter site/domain to clear alerts for (example: instagram.com or dummy-auth.local):', '');
    if (!site) return;
    const verified = await this.verifySensitiveAction('clear_site_alerts');
    if (!verified) return;
    const response = await this.sendMessage({ type: 'CLEAR_ALERTS', site: site.trim().toLowerCase() });
    if (!response.success) {
      this.toast(response.message || 'Failed to clear site alerts', 'error');
      return;
    }
    this.toast(`Cleared ${response.cleared || 0} alerts for ${site}`, 'success');
    await this.loadSecurity();
  }

  async showDecoysDev() {
    const proceed = window.confirm(
      'Developer mode: this will display plaintext decoy credentials for demo/testing. Continue?'
    );
    if (!proceed) return;
    const verified = await this.verifySensitiveAction('show_decoys_dev');
    if (!verified) return;
    const response = await this.sendMessage({ type: 'GET_DECOY_CREDENTIALS_DEV' });
    if (!response.success) {
      if (String(response.message || '').toLowerCase().includes('unknown message type')) {
        this.toast('Extension updated. Reload extension and reopen vault tab.', 'error');
        return;
      }
      if (response.requiresVerification) {
        this.toast('PIN verification required', 'error');
        return;
      }
      this.toast(response.message || 'Failed to load decoys', 'error');
      return;
    }
    const decoys = response.data || [];
    if (!decoys.length) {
      window.alert('No decoys generated yet.');
      return;
    }
    const summary = document.getElementById('decoyDetailsSummary');
    const list = document.getElementById('decoyDetailsList');
    const overlay = document.getElementById('decoyModalOverlay');
    if (!summary || !list || !overlay) return;
    summary.textContent = `Total decoys: ${decoys.length}. Showing all entries.`;
    list.innerHTML = '';
    decoys.forEach((d, idx) => {
      const row = document.createElement('div');
      row.className = 'breach-row';
      row.innerHTML = `
        <div><strong>${idx + 1}. [${d.serviceName}]</strong></div>
        <div><small>Username: ${d.username}</small></div>
        <div><small>Password: ${d.password}</small></div>
        <div><small>Status: ${d.monitoringStatus ? 'monitored' : 'pending'}</small></div>
      `;
      list.appendChild(row);
    });
    overlay.style.display = 'flex';
  }

  async triggerBreachTest() {
    const ok = window.confirm('Send a breach alert test email now?');
    if (!ok) return;
    const response = await this.sendMessage({ type: 'TRIGGER_BREACH_TEST' });
    if (!response.success) {
      if (response.requiresUnlock) return this.handleLockedSession();
      this.toast(response.message || 'Breach test failed', 'error');
      return;
    }
    const tone = response.emailSent ? 'success' : 'info';
    this.toast(response.message || 'Breach test completed.', tone);
    await this.loadSecurity();
  }

  async viewRecoveryCodes() {
    const verified = await this.verifySensitiveAction('view_recovery_codes');
    if (!verified) return;
    const response = await this.sendMessage({ type: 'GET_RECOVERY_CODES' });
    if (!response.success) {
      if (response.requiresVerification) {
        this.toast('PIN verification required', 'error');
        return;
      }
      this.toast(response.message || 'Failed to load recovery codes', 'error');
      return;
    }
    const codes = response.data?.recoveryCodes || [];
    window.alert(`Recovery codes (store safely):\n\n${codes.join('\n')}`);
  }

  async regenerateRecoveryCodes() {
    if (!window.confirm('Regenerate recovery codes? Previous codes will stop working.')) return;
    const verified = await this.verifySensitiveAction('regenerate_recovery_codes');
    if (!verified) return;
    const response = await this.sendMessage({ type: 'REGENERATE_RECOVERY_CODES' });
    if (!response.success) {
      this.toast(response.message || 'Failed to regenerate recovery codes', 'error');
      return;
    }
    const codes = response.data?.recoveryCodes || [];
    window.alert(`New recovery codes:\n\n${codes.join('\n')}`);
    this.toast('Recovery codes regenerated', 'success');
  }

  async lockVault() {
    await this.sendMessage({ type: 'LOCK_VAULT' });
    window.location.href = chrome.runtime.getURL('popup/popup.html');
  }

  toast(message, type = 'info') {
    const colors = {
      success: '#059669',
      error: '#dc2626',
      info: '#2563eb',
    };

    const node = document.createElement('div');
    node.textContent = message;
    node.style.cssText = [
      'position:fixed',
      'top:16px',
      'right:16px',
      'z-index:12000',
      `background:${colors[type] || colors.info}`,
      'color:white',
      'padding:10px 14px',
      'border-radius:8px',
      'box-shadow:0 8px 24px rgba(0,0,0,.2)',
      'font-size:13px',
      'max-width:360px',
    ].join(';');

    document.body.appendChild(node);
    setTimeout(() => node.remove(), 3000);
  }

  sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || {});
      });
    });
  }

  handleLockedSession() {
    this.toast('Session locked. Redirecting to unlock...', 'info');
    setTimeout(() => {
      window.location.href = chrome.runtime.getURL('popup/popup.html');
    }, 500);
    return false;
  }
}

let casperVault;
document.addEventListener('DOMContentLoaded', () => {
  casperVault = new CasperVault();
});
