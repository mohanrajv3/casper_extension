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
  breachPollTimer: null,
};

const DEFAULT_SETTINGS = {
  autoFill: true,
  autoLockMinutes: 5,
  breachAlerts: true,
  syncEnabled: true,
  auth: {
    maxUnlockAttempts: 5,
    lockoutMinutes: 5,
    otpDefaultPeriod: 30,
    otpGraceWindows: 1,
  },
  deception: {
    monitoringEnabled: true,
    honeyServerUrl: '',
    honeyApiKey: '',
    decoyCount: 3,
    pollIntervalSeconds: 60,
  },
  mailService: {
    provider: 'emailjs',
    serviceId: EMAILJS_CONFIG.serviceId,
    templateId: EMAILJS_CONFIG.breachTemplateId,
    publicKey: EMAILJS_CONFIG.publicKey,
    toEmail: '',
  },
};

const RECOVERY_CODE_COUNT = 8;
const RECOVERY_CODE_BYTES = 5;

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

async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomRecoveryCode() {
  const bytes = new Uint8Array(RECOVERY_CODE_BYTES);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

async function generateRecoveryCodeBundle(count = RECOVERY_CODE_COUNT) {
  const plaintext = [];
  const hashes = [];
  for (let i = 0; i < count; i++) {
    const code = randomRecoveryCode();
    plaintext.push(code);
    hashes.push(await sha256Hex(code));
  }
  return { plaintext, hashes };
}

function isOffHours(ts = now()) {
  const hour = new Date(ts).getHours();
  return hour < 6 || hour >= 23;
}

async function addRiskEvent(kind, details = {}) {
  if (!session.vaultData) return;
  const event = {
    id: makeId(8),
    type: 'risk_signal',
    message: `Risk signal: ${kind}`,
    severity: 'MEDIUM',
    details: {
      kind,
      ...details,
    },
    timestamp: now(),
  };
  session.vaultData.security.events.unshift(event);
  session.vaultData.security.events = session.vaultData.security.events.slice(0, 200);
  await persistVault();
}

function makeDecoyVariants(username, password, count) {
  const safeCount = Math.max(1, Math.min(Number(count || 3), 5));
  const suffixes = ['#', '!', '_2026', '.x', '@'];
  const usernameBase = String(username || '').trim();
  const passwordBase = String(password || '').trim();
  const variants = [];

  for (let i = 0; i < safeCount; i++) {
    const userDecoy = usernameBase.includes('@')
      ? usernameBase.replace('@', `+shadow${i + 1}@`)
      : `${usernameBase}_shadow${i + 1}`;
    const passDecoy = `${passwordBase}${suffixes[i % suffixes.length]}`;
    variants.push({ username: userDecoy, password: passDecoy });
  }

  return variants;
}

async function registerDecoysWithHoneyServer(decoys, serviceName) {
  const settings = session.vaultData?.settings?.deception || {};
  const baseUrl = String(settings.honeyServerUrl || '').trim().replace(/\/+$/, '');
  if (!settings.monitoringEnabled || !baseUrl || !Array.isArray(decoys) || !decoys.length) {
    return { success: false, skipped: true, message: 'Honey server not configured' };
  }

  let successCount = 0;
  const failures = [];

  for (const decoy of decoys) {
    try {
      const passwordHash = await sha256Hex(decoy.password);
      const resp = await fetch(`${baseUrl}/decoy/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.honeyApiKey ? { Authorization: `Bearer ${settings.honeyApiKey}` } : {}),
        },
        body: JSON.stringify({
          user_id: session.userId || 'default',
          decoy_id: decoy.decoyId,
          username: decoy.username,
          password_hash: passwordHash,
          service_name: serviceName,
        }),
      });

      if (!resp.ok) {
        const errorBody = await resp.text();
        failures.push({ decoyId: decoy.decoyId, status: resp.status, body: errorBody });
        continue;
      }

      successCount += 1;
      decoy.registeredAt = now();
      decoy.monitoringStatus = true;
    } catch (error) {
      failures.push({ decoyId: decoy.decoyId, error: error.message });
    }
  }

  return {
    success: successCount > 0,
    successCount,
    failures,
  };
}

async function checkHoneyServerForBreach() {
  const settings = session.vaultData?.settings?.deception || {};
  const baseUrl = String(settings.honeyServerUrl || '').trim().replace(/\/+$/, '');
  if (!settings.monitoringEnabled || !baseUrl) {
    return { success: false, skipped: true, message: 'Monitoring disabled or server not set' };
  }

  const monitoredDecoys = (session.vaultData.decoyCredentials || []).filter((d) => d.monitoringStatus);
  if (!monitoredDecoys.length) return { success: true, breach: false };
  const monitoredServices = Array.from(
    new Set((session.vaultData.passwords || []).map((p) => p.domain).filter(Boolean))
  );

  try {
    const resp = await fetch(`${baseUrl}/decoy/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.honeyApiKey ? { Authorization: `Bearer ${settings.honeyApiKey}` } : {}),
      },
      body: JSON.stringify({
        user_id: session.userId || 'default',
        decoy_ids: monitoredDecoys.map((d) => d.decoyId),
        monitor_services: monitoredServices,
        include_auth_failures: true,
        last_checked_at: session.vaultData.security?.lastHoneyCheckAt || 0,
      }),
    });

    const bodyRaw = await resp.text();
    let data = {};
    try {
      data = bodyRaw ? JSON.parse(bodyRaw) : {};
    } catch {
      data = {};
    }

    if (!resp.ok) {
      return {
        success: false,
        message: `Honey server check failed (${resp.status})`,
        details: data || bodyRaw,
      };
    }

    const breachDetected = Boolean(data.breach_detected);
    const events = Array.isArray(data.events) ? data.events : [];
    session.vaultData.security.lastHoneyCheckAt = now();
    await persistVault();

    if (!breachDetected) {
      const authFailureCount = events.filter((e) => String(e.event_type || '').startsWith('wrong_password')).length;
      for (const evt of events) {
        if (!String(evt.event_type || '').startsWith('wrong_password')) continue;
        addSecurityEvent('risk_auth_failure', 'Wrong-password attempt observed on monitored service', {
          service: evt.service_name || 'unknown',
          username: evt.username || 'unknown',
          ipAddress: evt.ip_address || evt.ip || 'unknown',
          eventType: evt.event_type || 'wrong_password',
          source: 'dummy_site',
          timestamp: evt.timestamp || new Date().toISOString(),
        });
      }
      if (authFailureCount > 0) await persistVault();
      return { success: true, breach: false, emailSentCount: 0, emailFailedCount: 0, authFailureCount };
    }

    let emailSentCount = 0;
    let emailFailedCount = 0;
    let authFailureCount = 0;

    for (const evt of events) {
      const eventType = String(evt.event_type || '');
      if (eventType.startsWith('wrong_password')) {
        authFailureCount += 1;
        addSecurityEvent('risk_auth_failure', 'Wrong-password attempt observed on monitored service', {
          service: evt.service_name || 'unknown',
          username: evt.username || 'unknown',
          ipAddress: evt.ip_address || evt.ip || 'unknown',
          eventType,
          source: 'dummy_site',
          timestamp: evt.timestamp || new Date().toISOString(),
        });
        continue;
      }

      const alertEvent = {
        id: makeId(8),
        type: 'breach_detected',
        message: 'Decoy credential usage detected by honey server',
        severity: 'CRITICAL',
        details: {
          decoyId: evt.decoy_id || 'unknown',
          ipAddress: evt.ip_address || evt.ip || 'unknown',
          timestamp: evt.timestamp || new Date().toISOString(),
          service: evt.service_name || 'unknown',
          source: 'honey_server',
        },
        timestamp: now(),
      };

      session.vaultData.security.breachAlerts.unshift(alertEvent);
      session.vaultData.security.breachAlerts = session.vaultData.security.breachAlerts.slice(0, 100);
      addSecurityEvent('breach_detected', alertEvent.message, alertEvent.details);
      await persistVault();
      const cloudData = await loadCloud();
      if (cloudData) {
        const mail = await sendBreachEmailIfConfigured(alertEvent, cloudData);
        if (mail?.sent) emailSentCount += 1;
        else if (!mail?.skipped) emailFailedCount += 1;
      }
    }

    return {
      success: true,
      breach: true,
      eventsCount: events.filter((e) => !String(e.event_type || '').startsWith('wrong_password')).length,
      emailSentCount,
      emailFailedCount,
      authFailureCount,
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function startBreachPolling() {
  if (!session.isUnlocked || !session.vaultData) return;
  if (session.breachPollTimer) {
    clearInterval(session.breachPollTimer);
    session.breachPollTimer = null;
  }
  const settings = session.vaultData.settings?.deception || {};
  if (!settings.monitoringEnabled) return;
  const intervalSec = Math.max(30, Number(settings.pollIntervalSeconds || 60));
  session.breachPollTimer = setInterval(() => {
    checkHoneyServerForBreach().catch(() => {
      // Keep polling alive; failures are recorded on demand.
    });
  }, intervalSec * 1000);
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
    decoyCredentials: Array.isArray(vault.decoyCredentials) ? vault.decoyCredentials : [],
    otpAccounts: Array.isArray(vault.otpAccounts) ? vault.otpAccounts : [],
    passkeys: Array.isArray(vault.passkeys) ? vault.passkeys : [],
    notes: Array.isArray(vault.notes) ? vault.notes : [],
    settings: { ...DEFAULT_SETTINGS, ...(vault.settings || {}) },
    security: {
      events: Array.isArray(vault.security?.events) ? vault.security.events : [],
      breachAlerts: Array.isArray(vault.security?.breachAlerts) ? vault.security.breachAlerts : [],
      failedUnlocks: Number(vault.security?.failedUnlocks || 0),
      lockoutUntil: Number(vault.security?.lockoutUntil || 0),
      recoveryCodeHashes: Array.isArray(vault.security?.recoveryCodeHashes) ? vault.security.recoveryCodeHashes : [],
      usedRecoveryCodeHashes: Array.isArray(vault.security?.usedRecoveryCodeHashes) ? vault.security.usedRecoveryCodeHashes : [],
      lastHoneyCheckAt: Number(vault.security?.lastHoneyCheckAt || 0),
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
  if (session.breachPollTimer) {
    clearInterval(session.breachPollTimer);
    session.breachPollTimer = null;
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

async function getLocalUnlockState() {
  const data = await chrome.storage.local.get(['authUnlockState']);
  return data.authUnlockState || { failedUnlocks: 0, lockoutUntil: 0 };
}

async function setLocalUnlockState(state) {
  await chrome.storage.local.set({ authUnlockState: state });
}

async function getLocalAuthPolicy() {
  const data = await chrome.storage.local.get(['authPolicy']);
  const policy = data.authPolicy || {};
  return {
    maxUnlockAttempts: Math.max(3, Number(policy.maxUnlockAttempts || DEFAULT_SETTINGS.auth.maxUnlockAttempts)),
    lockoutMinutes: Math.max(1, Number(policy.lockoutMinutes || DEFAULT_SETTINGS.auth.lockoutMinutes)),
  };
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
  if (!settings?.toEmail) {
    return { sent: false, skipped: true, reason: 'Alert email not configured' };
  }

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
    return { sent: true, status: result.status, result: result.body };
  } catch (error) {
    addSecurityEvent('mail_failed', 'Failed to send breach email', { error: error.message });
    await persistVault();
    if (cloudData?.security) {
      cloudData.security.lastAccess = now();
      await saveCloud(cloudData);
    }
    return { sent: false, skipped: false, error: error.message };
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

  const recoveryCodes = await generateRecoveryCodeBundle();
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
    security: {
      events: [],
      breachAlerts: [],
      failedUnlocks: 0,
      lockoutUntil: 0,
      recoveryCodeHashes: recoveryCodes.hashes,
      usedRecoveryCodeHashes: [],
      lastHoneyCheckAt: 0,
    },
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
  await setLocalUnlockState({ failedUnlocks: 0, lockoutUntil: 0 });
  await chrome.storage.local.set({
    authPolicy: {
      maxUnlockAttempts: DEFAULT_SETTINGS.auth.maxUnlockAttempts,
      lockoutMinutes: DEFAULT_SETTINGS.auth.lockoutMinutes,
    },
  });

  session.userId = cloudData.userId;
  session.key = encryptionKey;
  session.vaultData = vault;
  session.isUnlocked = true;
  session.unlockAt = now();
  resetAutoLock();

  addSecurityEvent('vault_initialized', 'Vault initialized');
  await persistVault();
  await sendWelcomeEmailIfConfigured(vault.settings.mailService.toEmail);
  startBreachPolling();

  return {
    success: true,
    message: 'Vault initialized',
    data: {
      recoveryCodes: recoveryCodes.plaintext,
    },
  };
}

async function unlockVault(pin) {
  if (!/^\d{4,6}$/.test(String(pin || ''))) {
    return { success: false, message: 'PIN must be 4-6 digits' };
  }

  const unlockState = await getLocalUnlockState();
  if (Number(unlockState.lockoutUntil || 0) > now()) {
    const seconds = Math.ceil((unlockState.lockoutUntil - now()) / 1000);
    return { success: false, message: `Too many attempts. Try again in ${seconds}s.` };
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

    await setLocalUnlockState({ failedUnlocks: 0, lockoutUntil: 0 });
    await chrome.storage.local.set({
      authPolicy: {
        maxUnlockAttempts: Number(decryptedVault.settings?.auth?.maxUnlockAttempts || DEFAULT_SETTINGS.auth.maxUnlockAttempts),
        lockoutMinutes: Number(decryptedVault.settings?.auth?.lockoutMinutes || DEFAULT_SETTINGS.auth.lockoutMinutes),
      },
    });
    addSecurityEvent('vault_unlocked', 'Vault unlocked');
    if (isOffHours()) {
      await addRiskEvent('off_hours_unlock', { localHour: new Date().getHours() });
    }
    await persistVault();
    startBreachPolling();

    return {
      success: true,
      message: 'Vault unlocked',
      data: {
        entryCount: decryptedVault.passwords.length,
        otpCount: decryptedVault.otpAccounts.length,
      },
    };
  } catch (error) {
    const policy = await getLocalAuthPolicy();
    const failed = Number(unlockState.failedUnlocks || 0) + 1;
    const locked = failed >= policy.maxUnlockAttempts;
    await setLocalUnlockState({
      failedUnlocks: failed,
      lockoutUntil: locked ? now() + policy.lockoutMinutes * 60 * 1000 : 0,
    });
    if (locked) {
      return { success: false, message: `Too many attempts. Locked for ${policy.lockoutMinutes} minute(s).` };
    }
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
  const decoyVariants = makeDecoyVariants(
    clean.username,
    clean.password,
    session.vaultData.settings?.deception?.decoyCount || 3
  );
  const decoys = decoyVariants.map((d) => ({
    decoyId: makeId(16),
    parentCredentialId: clean.id,
    serviceName: clean.domain || extractDomain(clean.url) || 'unknown',
    username: d.username,
    password: d.password,
    monitoringStatus: false,
    createdAt: now(),
    registeredAt: null,
  }));
  session.vaultData.decoyCredentials.push(...decoys);
  addSecurityEvent('password_added', 'Password entry added', { domain: clean.domain });
  await persistVault();
  const reg = await registerDecoysWithHoneyServer(decoys, clean.domain || 'unknown');
  addSecurityEvent('decoys_generated', 'Decoy credentials generated', {
    credentialId: clean.id,
    count: decoys.length,
    registered: reg.successCount || 0,
    failed: reg.failures?.length || 0,
  });
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
  const passwordChanged =
    Object.prototype.hasOwnProperty.call(updates, 'password') &&
    String(updates.password || '') !== String(existing.password || '');
  const usernameChanged =
    Object.prototype.hasOwnProperty.call(updates, 'username') &&
    String(updates.username || '') !== String(existing.username || '');
  const merged = { ...existing, ...updates, updatedAt: now() };
  merged.domain = extractDomain(merged.url || existing.url);
  session.vaultData.passwords[idx] = merged;
  if (passwordChanged || usernameChanged) {
    session.vaultData.decoyCredentials = session.vaultData.decoyCredentials.filter((d) => d.parentCredentialId !== id);
    const decoyVariants = makeDecoyVariants(
      merged.username,
      merged.password,
      session.vaultData.settings?.deception?.decoyCount || 3
    );
    const decoys = decoyVariants.map((d) => ({
      decoyId: makeId(16),
      parentCredentialId: merged.id,
      serviceName: merged.domain || extractDomain(merged.url) || 'unknown',
      username: d.username,
      password: d.password,
      monitoringStatus: false,
      createdAt: now(),
      registeredAt: null,
    }));
    session.vaultData.decoyCredentials.push(...decoys);
    const reg = await registerDecoysWithHoneyServer(decoys, merged.domain || 'unknown');
    addSecurityEvent('decoys_regenerated', 'Decoys regenerated for updated credential', {
      credentialId: merged.id,
      count: decoys.length,
      registered: reg.successCount || 0,
      failed: reg.failures?.length || 0,
    });
  }
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
  session.vaultData.decoyCredentials = session.vaultData.decoyCredentials.filter((d) => d.parentCredentialId !== id);
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

function validateOtpAccount(account, authSettings = DEFAULT_SETTINGS.auth) {
  const type = (account.type || 'totp').toLowerCase();
  if (!['totp', 'hotp'].includes(type)) throw new Error('OTP type must be totp or hotp');
  if (!account.secret) throw new Error('OTP secret is required');
  const defaultPeriod = Number(authSettings.otpDefaultPeriod) === 60 ? 60 : 30;
  const requestedPeriod = Number(account.period || defaultPeriod);
  const period = requestedPeriod === 60 ? 60 : 30;

  return {
    id: makeId(8),
    issuer: String(account.issuer || 'Unknown'),
    label: String(account.label || 'Account'),
    type,
    secret: core.normalizeBase32(String(account.secret)),
    algorithm: String(account.algorithm || 'SHA1').toUpperCase(),
    digits: Number(account.digits || 6),
    period,
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

  const normalized = validateOtpAccount(account, session.vaultData.settings?.auth || DEFAULT_SETTINGS.auth);

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

async function verifyOtpCode(id, code) {
  requireUnlocked();
  const account = session.vaultData.otpAccounts.find((a) => a.id === id);
  if (!account) return { success: false, message: 'OTP account not found' };
  const candidate = String(code || '').trim();
  if (!/^\d{6,8}$/.test(candidate)) return { success: false, message: 'OTP format invalid' };

  if (account.type === 'hotp') {
    const current = await core.generateOtpCode(account, now());
    const success = current.code === candidate;
    addSecurityEvent('otp_verify', success ? 'HOTP verified' : 'HOTP verification failed', {
      issuer: account.issuer,
      label: account.label,
    });
    await persistVault();
    return { success, message: success ? 'HOTP verified' : 'Invalid HOTP code' };
  }

  const grace = Math.max(0, Math.min(3, Number(session.vaultData.settings?.auth?.otpGraceWindows || 1)));
  const stepSec = Number(account.period || 30);
  let match = false;
  for (let offset = -grace; offset <= grace; offset++) {
    const at = now() + offset * stepSec * 1000;
    const generated = await core.generateOtpCode(account, at);
    if (generated.code === candidate) {
      match = true;
      break;
    }
  }
  addSecurityEvent('otp_verify', match ? 'TOTP verified' : 'TOTP verification failed', {
    issuer: account.issuer,
    label: account.label,
    graceWindows: grace,
  });
  await persistVault();
  return { success: match, message: match ? 'TOTP verified' : 'Invalid TOTP code' };
}

async function updateSettings(settings) {
  requireUnlocked();
  const nextMail = {
    ...session.vaultData.settings.mailService,
    toEmail: (settings.mailService?.toEmail || settings.alertEmail || session.vaultData.settings.mailService.toEmail || '').trim(),
  };
  const nextDeception = {
    ...session.vaultData.settings.deception,
    ...(settings.deception || {}),
  };
  const nextAuth = {
    ...session.vaultData.settings.auth,
    ...(settings.auth || {}),
  };
  nextAuth.maxUnlockAttempts = Math.max(3, Math.min(10, Number(nextAuth.maxUnlockAttempts || 5)));
  nextAuth.lockoutMinutes = Math.max(1, Math.min(60, Number(nextAuth.lockoutMinutes || 5)));
  nextAuth.otpDefaultPeriod = Number(nextAuth.otpDefaultPeriod) === 60 ? 60 : 30;
  nextAuth.otpGraceWindows = Math.max(0, Math.min(3, Number(nextAuth.otpGraceWindows || 1)));
  nextDeception.decoyCount = Math.max(1, Math.min(5, Number(nextDeception.decoyCount || 3)));
  nextDeception.pollIntervalSeconds = Math.max(30, Number(nextDeception.pollIntervalSeconds || 60));
  nextDeception.honeyServerUrl = String(nextDeception.honeyServerUrl || '').trim();
  nextDeception.honeyApiKey = String(nextDeception.honeyApiKey || '').trim();
  delete settings.mailService;
  delete settings.alertEmail;
  delete settings.auth;
  delete settings.deception;

  session.vaultData.settings = {
    ...session.vaultData.settings,
    ...settings,
    auth: nextAuth,
    deception: nextDeception,
    mailService: nextMail,
  };
  addSecurityEvent('settings_updated', 'Settings updated');
  await persistVault();
  await chrome.storage.local.set({
    authPolicy: {
      maxUnlockAttempts: nextAuth.maxUnlockAttempts,
      lockoutMinutes: nextAuth.lockoutMinutes,
    },
  });
  startBreachPolling();
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

async function getRecoveryCodes() {
  requireUnlocked();
  if (!hasSensitiveVerification()) {
    return { success: false, message: 'Sensitive verification required', requiresVerification: true };
  }
  const bundle = await generateRecoveryCodeBundle();
  session.vaultData.security.recoveryCodeHashes = bundle.hashes;
  session.vaultData.security.usedRecoveryCodeHashes = [];
  addSecurityEvent('recovery_codes_viewed', 'Recovery codes regenerated and viewed');
  await persistVault();
  return { success: true, data: { recoveryCodes: bundle.plaintext } };
}

async function regenerateRecoveryCodes() {
  requireUnlocked();
  if (!hasSensitiveVerification()) {
    return { success: false, message: 'Sensitive verification required', requiresVerification: true };
  }
  const bundle = await generateRecoveryCodeBundle();
  session.vaultData.security.recoveryCodeHashes = bundle.hashes;
  session.vaultData.security.usedRecoveryCodeHashes = [];
  addSecurityEvent('recovery_codes_regenerated', 'Recovery codes regenerated');
  await persistVault();
  return { success: true, data: { recoveryCodes: bundle.plaintext } };
}

async function getAuthStatus() {
  const state = await getLocalUnlockState();
  return {
    success: true,
    data: {
      failedUnlocks: Number(state.failedUnlocks || 0),
      lockoutUntil: Number(state.lockoutUntil || 0),
      isLockedOut: Number(state.lockoutUntil || 0) > now(),
    },
  };
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
  const settings = session.vaultData.settings?.deception || {};
  const baseUrl = String(settings.honeyServerUrl || '').trim().replace(/\/+$/, '');
  if (!settings.monitoringEnabled || !baseUrl) {
    return { success: false, message: 'Configure Honey Server URL in Settings first' };
  }

  const decoy = (session.vaultData.decoyCredentials || []).find((d) => d.monitoringStatus);
  if (!decoy) {
    return { success: false, message: 'No registered decoy available. Add a password first.' };
  }

  try {
    const resp = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.honeyApiKey ? { Authorization: `Bearer ${settings.honeyApiKey}` } : {}),
      },
      body: JSON.stringify({
        username: decoy.username,
        password: decoy.password,
      }),
    });
    addSecurityEvent('breach_test', 'Simulated attacker login sent to honey endpoint', {
      decoyId: decoy.decoyId,
      status: resp.status,
    });
    await persistVault();
    const check = await checkHoneyServerForBreach();
    if (!check.success) {
      return { success: false, message: check.message || 'Breach check failed' };
    }
    if (check.breach) {
      const sent = Number(check.emailSentCount || 0);
      const failed = Number(check.emailFailedCount || 0);
      let message = 'Breach detected from honey server.';
      if (sent > 0) {
        message += ` Alert email sent (${sent}).`;
      } else if (failed > 0) {
        message += ` Email send failed (${failed}).`;
      } else {
        message += ' No alert email was sent.';
      }
      return { success: true, breach: true, emailSent: sent > 0, message };
    }

    const cloudData = await loadCloud();
    const testEvent = {
      id: makeId(8),
      type: 'breach_test',
      message: 'Manual breach test email',
      severity: 'TEST',
      details: {
        decoyId: decoy.decoyId,
        source: 'manual_test',
        service: decoy.serviceName || 'unknown',
      },
      timestamp: now(),
    };
    const fallbackMail = await sendBreachEmailIfConfigured(testEvent, cloudData);
    if (fallbackMail?.sent) {
      return {
        success: true,
        breach: false,
        emailSent: true,
        message: 'No new breach event found, but manual breach test email was sent.',
      };
    }
    return {
      success: true,
      breach: false,
      emailSent: false,
      message: fallbackMail?.reason || fallbackMail?.error || 'No breach event returned and email was not sent.',
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function getDecoyStatus() {
  requireUnlocked();
  const all = session.vaultData.decoyCredentials || [];
  const monitored = all.filter((d) => d.monitoringStatus);
  return {
    success: true,
    data: {
      totalDecoys: all.length,
      monitoredDecoys: monitored.length,
      lastHoneyCheckAt: session.vaultData.security?.lastHoneyCheckAt || null,
      honeyServerUrl: session.vaultData.settings?.deception?.honeyServerUrl || '',
      monitoringEnabled: Boolean(session.vaultData.settings?.deception?.monitoringEnabled),
    },
  };
}

async function getDecoyCredentialsDev() {
  requireUnlocked();
  if (!hasSensitiveVerification()) {
    return { success: false, message: 'Sensitive verification required', requiresVerification: true };
  }
  const decoys = (session.vaultData.decoyCredentials || []).map((d) => ({
    decoyId: d.decoyId,
    parentCredentialId: d.parentCredentialId,
    serviceName: d.serviceName,
    username: d.username,
    password: d.password,
    monitoringStatus: Boolean(d.monitoringStatus),
    createdAt: d.createdAt,
    registeredAt: d.registeredAt,
  }));
  return { success: true, data: decoys };
}

async function checkBreachNow() {
  requireUnlocked();
  const result = await checkHoneyServerForBreach();
  if (!result.success) return { success: false, message: result.message || 'Breach check failed', details: result.details };
  return {
    success: true,
    breach: Boolean(result.breach),
    eventsCount: result.eventsCount || 0,
    authFailureCount: result.authFailureCount || 0,
    totalBreachAlerts: Array.isArray(session.vaultData?.security?.breachAlerts)
      ? session.vaultData.security.breachAlerts.length
      : 0,
  };
}

async function getSecurityEvents() {
  requireUnlocked();
  const authState = await getLocalUnlockState();
  return {
    success: true,
    data: {
      events: session.vaultData.security.events,
      breachAlerts: session.vaultData.security.breachAlerts,
      failedUnlocks: Number(authState.failedUnlocks || 0),
      lockoutUntil: Number(authState.lockoutUntil || 0),
      recoveryCodesAvailable: (session.vaultData.security.recoveryCodeHashes || []).length,
    },
  };
}

async function ingestSecurityEvent(event) {
  requireUnlocked();
  if (!event?.type) return { success: false, message: 'Invalid security event' };
  if (event.type === 'auth_failure' && String(event.source || '') === 'dummy_site') {
    addSecurityEvent('risk_auth_failure', 'Wrong-password attempt reported by dummy site', {
      service: event.service || 'unknown',
      username: event.username || 'unknown',
      reason: event.reason || 'invalid_credentials',
      source: 'dummy_site',
    });
    const warning = {
      id: makeId(8),
      type: 'breach_warning',
      message: 'Wrong-password activity detected on monitored login page',
      severity: 'WARNING',
      details: {
        service: event.service || 'unknown',
        username: event.username || 'unknown',
        source: 'dummy_site',
      },
      timestamp: now(),
    };
    session.vaultData.security.breachAlerts.unshift(warning);
    session.vaultData.security.breachAlerts = session.vaultData.security.breachAlerts.slice(0, 100);
    await persistVault();
    const cloudData = await loadCloud();
    if (cloudData) {
      await sendBreachEmailIfConfigured(warning, cloudData);
    }
    return { success: true };
  }

  addSecurityEvent(event.type, `Page event: ${event.type}`, event);
  if (event.type === 'webauthn_get' || event.type === 'webauthn_create') {
    await addRiskEvent('webauthn_activity', {
      origin: event.origin || event.url || 'unknown',
      type: event.type,
    });
    return { success: true };
  }
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
      decoyCredentials: (session.vaultData.decoyCredentials || []).map((d) => ({
        ...d,
        password: '***masked***',
      })),
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
        case 'VERIFY_OTP_CODE':
          response = await verifyOtpCode(request.id, request.code);
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
        case 'GET_AUTH_STATUS':
          response = await getAuthStatus();
          break;
        case 'GET_RECOVERY_CODES':
          response = await getRecoveryCodes();
          break;
        case 'REGENERATE_RECOVERY_CODES':
          response = await regenerateRecoveryCodes();
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
        case 'GET_DECOY_STATUS':
          response = await getDecoyStatus();
          break;
        case 'GET_DECOY_CREDENTIALS_DEV':
          response = await getDecoyCredentialsDev();
          break;
        case 'CHECK_BREACH_NOW':
          response = await checkBreachNow();
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
