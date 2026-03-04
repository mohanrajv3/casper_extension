import { CasperCore } from './casper-core.js';
import { SyncManager } from './sync-manager.js';

const core = new CasperCore();
const sync = new SyncManager();

const EMAILJS_CONFIG = {
  serviceId: 'service_zi7rghf',
  publicKey: 'dXRu3TBvGNhECPyuB',
  breachTemplateId: 'template_n6m2wxk',
  welcomeTemplateId: 'template_zgcsbzo',
  senderEmail: 'remyreplies@gmail.com',
};

const session = {
  isUnlocked: false,
  key: null,
  vaultData: null,
  userId: null,
  unlockAt: null,
  autoLockTimer: null,
  sensitiveVerifiedUntil: 0,
};

const DEFAULT_SETTINGS = {
  autoFill: true,
  autoLockMinutes: 5,
  breachAlerts: true,
  syncEnabled: true,
  mailService: {
    provider: 'emailjs',
    serviceId: EMAILJS_CONFIG.serviceId,
    templateId: EMAILJS_CONFIG.breachTemplateId,
    publicKey: EMAILJS_CONFIG.publicKey,
    toEmail: '',
  },
};

function now() {
  return Date.now();
}

function makeId(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function nameFromEmail(email) {
  const local = String(email || '').split('@')[0] || 'User';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

async function sendEmailWithEmailJs(templateId, templateParams) {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_CONFIG.serviceId,
      template_id: templateId,
      user_id: EMAILJS_CONFIG.publicKey,
      template_params: templateParams,
    }),
  });

  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    body: parsed || raw || '',
  };
}

function normalizeVault(vault) {
  return {
    version: 2,
    createdAt: vault.createdAt || now(),
    updatedAt: now(),
    passwords: Array.isArray(vault.passwords) ? vault.passwords : [],
    otpAccounts: Array.isArray(vault.otpAccounts) ? vault.otpAccounts : [],
    passkeys: Array.isArray(vault.passkeys) ? vault.passkeys : [],
    notes: Array.isArray(vault.notes) ? vault.notes : [],
    settings: { ...DEFAULT_SETTINGS, ...(vault.settings || {}) },
    security: {
      events: Array.isArray(vault.security?.events) ? vault.security.events : [],
      breachAlerts: Array.isArray(vault.security?.breachAlerts) ? vault.security.breachAlerts : [],
      failedUnlocks: Number(vault.security?.failedUnlocks || 0),
    },
  };
}

function clearSession() {
  session.isUnlocked = false;
  session.key = null;
  session.vaultData = null;
  session.unlockAt = null;
  session.sensitiveVerifiedUntil = 0;
  if (session.autoLockTimer) {
    clearTimeout(session.autoLockTimer);
    session.autoLockTimer = null;
  }
}

function resetAutoLock() {
  if (!session.isUnlocked || !session.vaultData) return;
  if (session.autoLockTimer) clearTimeout(session.autoLockTimer);
  const minutes = Number(session.vaultData.settings?.autoLockMinutes || DEFAULT_SETTINGS.autoLockMinutes);
  if (minutes <= 0) return;
  session.autoLockTimer = setTimeout(() => {
    clearSession();
  }, minutes * 60 * 1000);
}

async function loadCloud() {
  return sync.loadCloudData();
}

async function saveCloud(cloudData) {
  await sync.saveCloudData(cloudData);
}

async function persistVault() {
  if (!session.isUnlocked || !session.key || !session.vaultData) {
    throw new Error('Vault is locked');
  }

  session.vaultData.updatedAt = now();

  const cloudData = await loadCloud();
  if (!cloudData) throw new Error('Cloud vault not initialized');

  const encrypted = await core.encryptJson(session.vaultData, session.key);
  cloudData.vault.data = core.bytesToBase64(encrypted);
  cloudData.vault.lastModified = now();
  cloudData.security.lastAccess = now();

  await saveCloud(cloudData);
  resetAutoLock();
}

function addSecurityEvent(type, message, details = {}) {
  if (!session.vaultData) return;

  const event = {
    id: makeId(8),
    type,
    message,
    details,
    timestamp: now(),
  };

  session.vaultData.security.events.unshift(event);
  session.vaultData.security.events = session.vaultData.security.events.slice(0, 200);
}

async function sendBreachEmailIfConfigured(event, cloudData) {
  const settings = session.vaultData?.settings?.mailService;
  if (!settings?.toEmail) return;

  try {
    const result = await sendEmailWithEmailJs(EMAILJS_CONFIG.breachTemplateId, {
      to_email: settings.toEmail || '',
      to_name: nameFromEmail(settings.toEmail),
      subject: 'CASPER Security Alert: Breach Detection Triggered',
      from_email: EMAILJS_CONFIG.senderEmail,
      breach_time: new Date(event.timestamp).toISOString(),
      breach_account: event.details?.credentialId || 'Unknown account',
      breach_website: event.details?.url || event.details?.source || 'Unknown website',
      breach_reason: event.message,
      partial_password: 'N/A',
      immediate_actions:
        '1) Lock vault immediately\\n2) Rotate critical passwords\\n3) Review recent logins\\n4) Recreate CASPER vault if compromise suspected',
      timestamp: new Date().toISOString(),
      breach_details: JSON.stringify(event.details || {}),
    });
    if (!result.ok) {
      throw new Error(`EmailJS ${result.status}: ${typeof result.body === 'string' ? result.body : JSON.stringify(result.body)}`);
    }
    addSecurityEvent('mail_breach_sent', 'Breach email sent', { status: result.status, result: result.body });
    await persistVault();
  } catch (error) {
    addSecurityEvent('mail_failed', 'Failed to send breach email', { error: error.message });
    await persistVault();
    cloudData.security.lastAccess = now();
    await saveCloud(cloudData);
  }
}

async function sendWelcomeEmailIfConfigured(toEmail) {
  if (!toEmail) return;
  try {
    const result = await sendEmailWithEmailJs(EMAILJS_CONFIG.welcomeTemplateId, {
      to_email: toEmail,
      to_name: nameFromEmail(toEmail),
      subject: 'Welcome to CASPER Password Manager',
      from_email: EMAILJS_CONFIG.senderEmail,
      vault_features:
        '• Encrypted password vault\\n• Authenticator (TOTP/HOTP)\\n• Auto-fill support\\n• Breach detection alerts',
      security_note: 'Keep your PIN safe. Never share it with anyone.',
      timestamp: new Date().toISOString(),
      message: 'Welcome to CASPER Password Manager & Authenticator.',
    });
    if (!result.ok) {
      throw new Error(`Welcome email failed (${result.status}): ${typeof result.body === 'string' ? result.body : JSON.stringify(result.body)}`);
    }
    addSecurityEvent('mail_welcome_sent', 'Welcome email sent', { toEmail, status: result.status, result: result.body });
    await persistVault();
  } catch (error) {
    addSecurityEvent('mail_welcome_failed', 'Failed to send welcome email', { error: error.message });
    await persistVault();
  }
}

async function getVaultStatus() {
  const cloud = await loadCloud();
  const entryCount = session.vaultData?.passwords?.length || 0;

  return {
    success: true,
    vaultExists: Boolean(cloud),
    isUnlocked: session.isUnlocked,
    entryCount,
    otpCount: session.vaultData?.otpAccounts?.length || 0,
  };
}

async function initializeVault(pin, alertEmail = '') {
  if (!/^\d{4,6}$/.test(String(pin || ''))) {
    return { success: false, message: 'PIN must be 4-6 digits' };
  }

  const detectionSecrets = core.generateDetectionSecrets();
  const salt = core.generateSalt();
  const selectorSalt = core.generateSelectorSalt();
  const { secret } = await core.selectSecret(detectionSecrets, String(pin), selectorSalt);
  const encryptionKey = await core.deriveEncryptionKey(String(pin), secret, salt);

  const fakeCount = Math.max(0, detectionSecrets.length - 1);
  const trapPublicKeys = await core.generateTrapPublicKeys(fakeCount);

  const vault = normalizeVault({
    createdAt: now(),
    passwords: [],
    otpAccounts: [],
    passkeys: [],
    notes: [],
    settings: {
      ...DEFAULT_SETTINGS,
      mailService: {
        ...DEFAULT_SETTINGS.mailService,
        toEmail: String(alertEmail || '').trim(),
      },
    },
    security: { events: [], breachAlerts: [], failedUnlocks: 0 },
  });

  const encryptedVault = await core.encryptJson(vault, encryptionKey);

  const cloudData = {
    userId: makeId(16),
    version: 2,
    casper: {
      detectionSecrets: detectionSecrets.map((s) => core.bytesToBase64(s)),
      salt: core.bytesToBase64(salt),
      selectorSalt: core.bytesToBase64(selectorSalt),
      trapPublicKeys: trapPublicKeys.map((k) => core.bytesToBase64(k)),
    },
    vault: {
      data: core.bytesToBase64(encryptedVault),
      lastModified: now(),
    },
    security: {
      lastAccess: now(),
      accessCount: 0,
      breachAlerts: [],
    },
  };

  await saveCloud(cloudData);

  session.userId = cloudData.userId;
  session.key = encryptionKey;
  session.vaultData = vault;
  session.isUnlocked = true;
  session.unlockAt = now();
  resetAutoLock();

  addSecurityEvent('vault_initialized', 'Vault initialized');
  await persistVault();
  await sendWelcomeEmailIfConfigured(vault.settings.mailService.toEmail);

  return { success: true, message: 'Vault initialized' };
}

async function unlockVault(pin) {
  if (!/^\d{4,6}$/.test(String(pin || ''))) {
    return { success: false, message: 'PIN must be 4-6 digits' };
  }

  const cloudData = await loadCloud();
  if (!cloudData) return { success: false, message: 'Vault not initialized' };

  try {
    const secrets = cloudData.casper.detectionSecrets.map((s) => core.base64ToBytes(s));
    const salt = core.base64ToBytes(cloudData.casper.salt);
    const selectorSalt = core.base64ToBytes(cloudData.casper.selectorSalt);
    const { secret } = await core.selectSecret(secrets, String(pin), selectorSalt);

    const key = await core.deriveEncryptionKey(String(pin), secret, salt);
    const encryptedVault = core.base64ToBytes(cloudData.vault.data);
    const decryptedVault = normalizeVault(await core.decryptJson(encryptedVault, key));

    session.key = key;
    session.vaultData = decryptedVault;
    session.userId = cloudData.userId;
    session.isUnlocked = true;
    session.unlockAt = now();
    resetAutoLock();

    cloudData.security.lastAccess = now();
    cloudData.security.accessCount = Number(cloudData.security.accessCount || 0) + 1;
    await saveCloud(cloudData);

    addSecurityEvent('vault_unlocked', 'Vault unlocked');
    await persistVault();

    return {
      success: true,
      message: 'Vault unlocked',
      data: {
        entryCount: decryptedVault.passwords.length,
        otpCount: decryptedVault.otpAccounts.length,
      },
    };
  } catch (error) {
    return { success: false, message: 'Invalid PIN or corrupted vault' };
  }
}

function lockVault() {
  clearSession();
  return { success: true, message: 'Vault locked' };
}

function requireUnlocked() {
  if (!session.isUnlocked || !session.vaultData) {
    const err = new Error('Vault is locked');
    err.code = 'VAULT_LOCKED';
    throw err;
  }
  resetAutoLock();
}

async function verifyPinValue(pin) {
  if (!/^\d{4,6}$/.test(String(pin || ''))) return false;

  const cloudData = await loadCloud();
  if (!cloudData) return false;

  try {
    const secrets = cloudData.casper.detectionSecrets.map((s) => core.base64ToBytes(s));
    const salt = core.base64ToBytes(cloudData.casper.salt);
    const selectorSalt = core.base64ToBytes(cloudData.casper.selectorSalt);
    const { secret } = await core.selectSecret(secrets, String(pin), selectorSalt);
    const key = await core.deriveEncryptionKey(String(pin), secret, salt);
    const encryptedVault = core.base64ToBytes(cloudData.vault.data);
    await core.decryptJson(encryptedVault, key);
    return true;
  } catch {
    return false;
  }
}

async function verifySensitivePin(pin, reason = 'sensitive_action') {
  requireUnlocked();
  const valid = await verifyPinValue(pin);
  if (!valid) {
    addSecurityEvent('sensitive_auth_failed', 'Sensitive verification failed', { reason });
    await persistVault();
    return { success: false, message: 'PIN verification failed' };
  }
  session.sensitiveVerifiedUntil = now() + 2 * 60 * 1000;
  addSecurityEvent('sensitive_auth_success', 'Sensitive verification passed', { reason });
  await persistVault();
  return { success: true };
}

function hasSensitiveVerification() {
  return session.sensitiveVerifiedUntil > now();
}

function sanitizePasswordEntry(entry) {
  if (!entry?.url || !entry?.username || !entry?.password) {
    throw new Error('Missing required fields');
  }

  const url = String(entry.url);
  return {
    id: makeId(8),
    url,
    domain: extractDomain(url),
    title: String(entry.title || extractDomain(url) || 'Login'),
    username: String(entry.username),
    password: String(entry.password),
    notes: String(entry.notes || ''),
    createdAt: now(),
    updatedAt: now(),
    lastUsedAt: null,
  };
}

async function addPassword(entry) {
  requireUnlocked();
  const clean = sanitizePasswordEntry(entry);
  session.vaultData.passwords.push(clean);
  addSecurityEvent('password_added', 'Password entry added', { domain: clean.domain });
  await persistVault();
  await maybeSetRecipientAndSendWelcome(clean.username);
  return { success: true, data: clean };
}

function findPasswordsForUrl(url) {
  const domain = extractDomain(url);
  return session.vaultData.passwords.filter((p) => p.domain === domain);
}

async function getPasswords(url) {
  if (!session.isUnlocked || !session.vaultData) {
    return { success: false, message: 'Vault is locked', requiresUnlock: true, data: [] };
  }
  return { success: true, data: findPasswordsForUrl(url) };
}

async function getAllPasswords() {
  requireUnlocked();
  return { success: true, data: session.vaultData.passwords };
}

async function updatePassword(id, updates) {
  requireUnlocked();
  if (!hasSensitiveVerification()) {
    return { success: false, message: 'Sensitive verification required', requiresVerification: true };
  }
  const idx = session.vaultData.passwords.findIndex((p) => p.id === id);
  if (idx < 0) return { success: false, message: 'Password not found' };

  const existing = session.vaultData.passwords[idx];
  const merged = { ...existing, ...updates, updatedAt: now() };
  merged.domain = extractDomain(merged.url || existing.url);
  session.vaultData.passwords[idx] = merged;
  addSecurityEvent('password_updated', 'Password entry updated', { id });
  await persistVault();
  return { success: true, data: merged };
}

async function deletePassword(id) {
  requireUnlocked();
  if (!hasSensitiveVerification()) {
    return { success: false, message: 'Sensitive verification required', requiresVerification: true };
  }
  const before = session.vaultData.passwords.length;
  session.vaultData.passwords = session.vaultData.passwords.filter((p) => p.id !== id);
  if (session.vaultData.passwords.length === before) {
    return { success: false, message: 'Password not found' };
  }
  addSecurityEvent('password_deleted', 'Password entry deleted', { id });
  await persistVault();
  return { success: true };
}

async function autofillRequest(url) {
  if (!session.isUnlocked || !session.vaultData) {
    return { success: false, message: 'Vault is locked', requiresUnlock: true };
  }
  const passwords = findPasswordsForUrl(url);
  if (!passwords.length) return { success: false, message: 'No credentials found' };

  const credential = passwords[0];
  credential.lastUsedAt = now();
  await persistVault();

  return {
    success: true,
    credential: {
      id: credential.id,
      username: credential.username,
      password: credential.password,
    },
  };
}

async function saveCredentials(credentials, senderTab) {
  requireUnlocked();
  const url = senderTab?.url || credentials?.url;
  const title = senderTab?.title || credentials?.title || extractDomain(url);

  const existing = session.vaultData.passwords.find(
    (p) => p.domain === extractDomain(url) && p.username === credentials.username
  );

  if (existing) {
    existing.password = credentials.password;
    existing.updatedAt = now();
    existing.lastUsedAt = now();
    await persistVault();
    await maybeSetRecipientAndSendWelcome(existing.username);
    return { success: true, data: existing, updated: true };
  }

  const response = await addPassword({
    url,
    title,
    username: credentials.username,
    password: credentials.password,
    notes: credentials.notes || '',
  });

  if (response.success) {
    await maybeSetRecipientAndSendWelcome(String(credentials.username || '').trim());
  }

  return response;
}

async function maybeSetRecipientAndSendWelcome(candidateEmail) {
  requireUnlocked();
  const email = String(candidateEmail || '').trim();
  const hasCandidate = isValidEmail(email);
  const currentRecipient = String(session.vaultData.settings.mailService.toEmail || '').trim();

  if (!currentRecipient && hasCandidate) {
    session.vaultData.settings.mailService.toEmail = email;
    addSecurityEvent('mail_recipient_set', 'Alert email inferred from username');
    await persistVault();
  }

  const recipient = String(session.vaultData.settings.mailService.toEmail || '').trim();
  if (!isValidEmail(recipient)) return;
  if (session.vaultData.settings.mailService.lastWelcomeEmail === recipient) return;

  await sendWelcomeEmailIfConfigured(recipient);
  session.vaultData.settings.mailService.lastWelcomeEmail = recipient;
  session.vaultData.settings.mailService.lastWelcomeAt = now();
  await persistVault();
}

function generatePassword(options = {}) {
  return {
    success: true,
    password: core.generatePassword(Number(options.length || 20), options.includeSymbols !== false),
  };
}

function validateOtpAccount(account) {
  const type = (account.type || 'totp').toLowerCase();
  if (!['totp', 'hotp'].includes(type)) throw new Error('OTP type must be totp or hotp');
  if (!account.secret) throw new Error('OTP secret is required');

  return {
    id: makeId(8),
    issuer: String(account.issuer || 'Unknown'),
    label: String(account.label || 'Account'),
    type,
    secret: core.normalizeBase32(String(account.secret)),
    algorithm: String(account.algorithm || 'SHA1').toUpperCase(),
    digits: Number(account.digits || 6),
    period: Number(account.period || 30),
    counter: Number(account.counter || 0),
    createdAt: now(),
    updatedAt: now(),
  };
}

async function addOtpAccount(payload) {
  requireUnlocked();

  const account = payload.otpauthUrl
    ? core.parseOtpAuthUri(String(payload.otpauthUrl))
    : payload;

  const normalized = validateOtpAccount(account);

  const duplicate = session.vaultData.otpAccounts.find(
    (a) => a.issuer === normalized.issuer && a.label === normalized.label && a.type === normalized.type
  );
  if (duplicate) return { success: false, message: 'Duplicate OTP account' };

  session.vaultData.otpAccounts.push(normalized);
  addSecurityEvent('otp_added', 'Authenticator account added', {
    issuer: normalized.issuer,
    label: normalized.label,
  });
  await persistVault();

  return { success: true, data: normalized };
}

async function getOtpAccounts() {
  requireUnlocked();
  return {
    success: true,
    data: session.vaultData.otpAccounts.map((a) => ({
      id: a.id,
      issuer: a.issuer,
      label: a.label,
      type: a.type,
      algorithm: a.algorithm,
      digits: a.digits,
      period: a.period,
      counter: a.counter,
    })),
  };
}

async function deleteOtpAccount(id) {
  requireUnlocked();
  const before = session.vaultData.otpAccounts.length;
  session.vaultData.otpAccounts = session.vaultData.otpAccounts.filter((a) => a.id !== id);
  if (before === session.vaultData.otpAccounts.length) {
    return { success: false, message: 'OTP account not found' };
  }
  addSecurityEvent('otp_deleted', 'Authenticator account deleted', { id });
  await persistVault();
  return { success: true };
}

async function incrementHotp(id) {
  requireUnlocked();
  const account = session.vaultData.otpAccounts.find((a) => a.id === id && a.type === 'hotp');
  if (!account) return { success: false, message: 'HOTP account not found' };
  account.counter += 1;
  account.updatedAt = now();
  await persistVault();
  return { success: true, counter: account.counter };
}

async function getOtpCodes() {
  requireUnlocked();
  const list = [];

  for (const account of session.vaultData.otpAccounts) {
    const otp = await core.generateOtpCode(account, now());
    list.push({
      id: account.id,
      issuer: account.issuer,
      label: account.label,
      type: account.type,
      digits: account.digits,
      code: otp.code,
      remaining: otp.remaining,
      counter: otp.counter,
    });
  }

  return { success: true, data: list };
}

async function updateSettings(settings) {
  requireUnlocked();
  const nextMail = {
    ...session.vaultData.settings.mailService,
    toEmail: (settings.mailService?.toEmail || settings.alertEmail || session.vaultData.settings.mailService.toEmail || '').trim(),
  };
  delete settings.mailService;
  delete settings.alertEmail;

  session.vaultData.settings = {
    ...session.vaultData.settings,
    ...settings,
    mailService: nextMail,
  };
  addSecurityEvent('settings_updated', 'Settings updated');
  await persistVault();
  return { success: true, data: session.vaultData.settings };
}

async function getSettings() {
  requireUnlocked();
  return { success: true, data: session.vaultData.settings };
}

async function sendTestEmail(payload = {}) {
  requireUnlocked();
  const mail = {
    ...session.vaultData.settings.mailService,
    ...(payload.mailService || {}),
  };

  if (!mail.toEmail) {
    return { success: false, message: 'Email settings incomplete' };
  }

  try {
    const result = await sendEmailWithEmailJs(EMAILJS_CONFIG.welcomeTemplateId, {
      to_email: mail.toEmail,
      to_name: nameFromEmail(mail.toEmail),
      subject: 'CASPER Email Test',
      from_email: EMAILJS_CONFIG.senderEmail,
      vault_features: 'Test message from CASPER settings',
      security_note: 'No action required',
      timestamp: new Date().toISOString(),
      welcome_time: new Date().toISOString(),
      breach_time: new Date().toISOString(),
      breach_reason: 'CASPER test email',
      breach_account: 'test-account',
      breach_website: 'extension://settings',
      partial_password: 'N/A',
      immediate_actions: 'This is only a test.',
      breach_details: 'Manual test from extension settings',
      message: 'CASPER mail integration is working.',
    });
    if (!result.ok) {
      throw new Error(`EmailJS ${result.status}: ${typeof result.body === 'string' ? result.body : JSON.stringify(result.body)}`);
    }
    addSecurityEvent('mail_test_sent', 'Test email sent', { status: result.status, result: result.body });
    await persistVault();
    return { success: true, message: 'Test email sent', details: result.body };
  } catch (error) {
    addSecurityEvent('mail_test_failed', 'Test email failed', { error: error.message });
    await persistVault();
    return { success: false, message: error.message };
  }
}

async function checkBreach(publicKeyB64, context = {}) {
  const cloudData = await loadCloud();
  if (!cloudData) return { success: false, message: 'No vault initialized' };

  const isTrap = core.isTrapPublicKey(publicKeyB64, cloudData.casper.trapPublicKeys || []);
  if (!isTrap) return { success: true, breach: false };

  if (!session.isUnlocked) {
    return { success: true, breach: true, severity: 'CRITICAL', reason: 'Trap key used' };
  }

  const event = {
    id: makeId(8),
    type: 'breach_detected',
    message: 'Trap key detected. Cloud vault may be compromised.',
    severity: 'CRITICAL',
    details: context,
    timestamp: now(),
  };

  session.vaultData.security.breachAlerts.unshift(event);
  session.vaultData.security.breachAlerts = session.vaultData.security.breachAlerts.slice(0, 100);
  addSecurityEvent('breach_detected', event.message, context);
  await persistVault();

  cloudData.security.breachAlerts = cloudData.security.breachAlerts || [];
  cloudData.security.breachAlerts.unshift(event);
  cloudData.security.lastAccess = now();
  await saveCloud(cloudData);

  await sendBreachEmailIfConfigured(event, cloudData);

  return {
    success: true,
    breach: true,
    severity: 'CRITICAL',
    reason: event.message,
    event,
  };
}

async function triggerBreachTest() {
  requireUnlocked();
  const cloudData = await loadCloud();
  if (!cloudData) return { success: false, message: 'No vault initialized' };

  const event = {
    id: makeId(8),
    type: 'breach_test',
    message: 'Manual breach-email test triggered by user',
    severity: 'TEST',
    details: {
      url: 'extension://vault/security',
      source: 'manual_test',
      credentialId: 'test-credential',
    },
    timestamp: now(),
  };

  addSecurityEvent('breach_test', event.message, event.details);
  await persistVault();
  await sendBreachEmailIfConfigured(event, cloudData);
  return { success: true, message: 'Breach test triggered' };
}

async function getSecurityEvents() {
  requireUnlocked();
  return {
    success: true,
    data: {
      events: session.vaultData.security.events,
      breachAlerts: session.vaultData.security.breachAlerts,
    },
  };
}

async function ingestSecurityEvent(event) {
  requireUnlocked();
  if (!event?.type) return { success: false, message: 'Invalid security event' };
  addSecurityEvent(event.type, `Page event: ${event.type}`, event);
  await persistVault();
  return { success: true };
}

async function exportVault() {
  requireUnlocked();
  return {
    success: true,
    data: {
      exportedAt: now(),
      passwords: session.vaultData.passwords,
      otpAccounts: session.vaultData.otpAccounts.map((a) => ({ ...a, secret: '***masked***' })),
      security: session.vaultData.security,
    },
  };
}

async function openVaultTab() {
  if (chrome.tabs?.create) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('vault/vault.html') });
  }
  return { success: true };
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('CASPER extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      let response;
      switch (request.type) {
        case 'VAULT_STATUS':
          response = await getVaultStatus();
          break;
        case 'INITIALIZE_VAULT':
          response = await initializeVault(request.pin, request.alertEmail || '');
          break;
        case 'UNLOCK_VAULT':
          response = await unlockVault(request.pin);
          break;
        case 'LOCK_VAULT':
          response = lockVault();
          break;
        case 'ADD_PASSWORD':
          response = await addPassword(request.entry);
          break;
        case 'GET_PASSWORDS':
          response = await getPasswords(request.url);
          break;
        case 'GET_ALL_PASSWORDS':
          response = await getAllPasswords();
          break;
        case 'UPDATE_PASSWORD':
          response = await updatePassword(request.id, request.updates || {});
          break;
        case 'DELETE_PASSWORD':
          response = await deletePassword(request.id);
          break;
        case 'GENERATE_PASSWORD':
          response = generatePassword(request.options || {});
          break;
        case 'AUTOFILL_REQUEST':
          response = await autofillRequest(request.url);
          break;
        case 'SAVE_CREDENTIALS':
          response = await saveCredentials(request.credentials || {}, sender.tab);
          break;
        case 'GET_OTP_ACCOUNTS':
          response = await getOtpAccounts();
          break;
        case 'ADD_OTP_ACCOUNT':
          response = await addOtpAccount(request.account || {});
          break;
        case 'DELETE_OTP_ACCOUNT':
          response = await deleteOtpAccount(request.id);
          break;
        case 'GET_OTP_CODES':
          response = await getOtpCodes();
          break;
        case 'INCREMENT_HOTP':
          response = await incrementHotp(request.id);
          break;
        case 'UPDATE_SETTINGS':
          response = await updateSettings(request.settings || {});
          break;
        case 'GET_SETTINGS':
          response = await getSettings();
          break;
        case 'VERIFY_PIN':
          response = await verifySensitivePin(request.pin, request.reason || 'verify_pin');
          break;
        case 'SEND_TEST_EMAIL':
          response = await sendTestEmail(request || {});
          break;
        case 'GET_SECURITY_EVENTS':
          response = await getSecurityEvents();
          break;
        case 'SECURITY_EVENT':
          response = await ingestSecurityEvent(request.event || {});
          break;
        case 'CHECK_BREACH':
          response = await checkBreach(request.publicKey, {
            url: request.url,
            credentialId: request.credentialId,
            source: sender.url || sender.tab?.url || 'unknown',
          });
          break;
        case 'TRIGGER_BREACH_TEST':
          response = await triggerBreachTest();
          break;
        case 'EXPORT_VAULT':
          response = await exportVault();
          break;
        case 'OPEN_VAULT':
          response = await openVaultTab();
          break;
        case 'LOGIN_FORMS_DETECTED':
          response = { success: true };
          break;
        default:
          response = { success: false, message: 'Unknown message type' };
      }
      sendResponse(response);
    } catch (error) {
      const isLocked = error?.code === 'VAULT_LOCKED' || /vault is locked/i.test(String(error?.message || ''));
      if (isLocked) {
        sendResponse({
          success: false,
          message: 'Vault is locked. Please unlock and retry.',
          requiresUnlock: true,
        });
        return;
      }
      sendResponse({ success: false, message: error.message || 'Unknown error' });
    }
  })();

  return true;
});
