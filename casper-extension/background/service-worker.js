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
  deception: {
    enabled: true,
    decoyCount: 2,
  },
  honeyServer: {
    baseUrl: 'http://127.0.0.1:8787',
    apiToken: '',
    pollSeconds: 60,
    autoPoll: true,
    lastCheckedAt: 0,
    lastStatus: 'idle',
    lastError: '',
  },
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

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizeNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeSettings(settings = {}) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    deception: {
      ...DEFAULT_SETTINGS.deception,
      ...(settings?.deception || {}),
    },
    honeyServer: {
      ...DEFAULT_SETTINGS.honeyServer,
      ...(settings?.honeyServer || {}),
    },
    mailService: {
      ...DEFAULT_SETTINGS.mailService,
      ...(settings?.mailService || {}),
    },
  };

  merged.deception = {
    enabled: normalizeBoolean(merged.deception.enabled, true),
    decoyCount: normalizeNumber(merged.deception.decoyCount, 2, 0, 5),
  };

  merged.honeyServer = {
    baseUrl: String(merged.honeyServer.baseUrl || '').trim(),
    apiToken: String(merged.honeyServer.apiToken || '').trim(),
    pollSeconds: normalizeNumber(merged.honeyServer.pollSeconds, 60, 15, 3600),
    autoPoll: normalizeBoolean(merged.honeyServer.autoPoll, false),
    lastCheckedAt: Number(merged.honeyServer.lastCheckedAt || 0),
    lastStatus: String(merged.honeyServer.lastStatus || 'idle'),
    lastError: String(merged.honeyServer.lastError || ''),
  };

  merged.mailService = {
    ...merged.mailService,
    toEmail: String(merged.mailService.toEmail || '').trim(),
  };

  return merged;
}

function normalizePasswordEntries(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const isDecoy = Boolean(entry?.isDecoy);
    const decoyId = String(entry?.decoyMeta?.decoyId || entry?.decoyId || '');
    return {
      id: String(entry?.id || makeId(8)),
      url: String(entry?.url || ''),
      domain: String(entry?.domain || extractDomain(entry?.url || '')),
      title: String(entry?.title || extractDomain(entry?.url || '') || 'Login'),
      username: String(entry?.username || ''),
      password: String(entry?.password || ''),
      notes: String(entry?.notes || ''),
      createdAt: Number(entry?.createdAt || now()),
      updatedAt: Number(entry?.updatedAt || now()),
      lastUsedAt: entry?.lastUsedAt ? Number(entry.lastUsedAt) : null,
      isDecoy,
      decoyMeta: isDecoy
        ? {
            decoyId: decoyId || makeId(8),
            serviceName: String(entry?.decoyMeta?.serviceName || extractDomain(entry?.url || '')),
            monitoringStatus: normalizeBoolean(entry?.decoyMeta?.monitoringStatus, false),
            registeredAt: Number(entry?.decoyMeta?.registeredAt || 0),
            lastError: String(entry?.decoyMeta?.lastError || ''),
            breachedAt: Number(entry?.decoyMeta?.breachedAt || 0),
          }
        : null,
    };
  });
}

function normalizeHoneyBaseUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  return value.replace(/\/+$/, '');
}

function getHoneyServerSettings() {
  const settings = normalizeSettings(session.vaultData?.settings || DEFAULT_SETTINGS);
  return settings.honeyServer;
}

function fnv1aHash(input) {
  let h = 0x811c9dc5;
  const str = String(input || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function computeEventHash(event) {
  const material = [
    String(event.prevHash || 'GENESIS'),
    String(event.seq || 0),
    String(event.type || ''),
    String(event.message || ''),
    stableStringify(event.details || {}),
    String(event.timestamp || 0),
  ].join('|');
  return fnv1aHash(material);
}

function normalizeSecurityState(rawSecurity = {}) {
  const security = {
    events: Array.isArray(rawSecurity?.events) ? rawSecurity.events : [],
    breachAlerts: Array.isArray(rawSecurity?.breachAlerts) ? rawSecurity.breachAlerts : [],
    failedUnlocks: Number(rawSecurity?.failedUnlocks || 0),
    eventChainTip: String(rawSecurity?.eventChainTip || 'GENESIS'),
    chainValidAt: Number(rawSecurity?.chainValidAt || 0),
    chainBrokenAt: Number(rawSecurity?.chainBrokenAt || 0),
    compromisedMode: {
      active: Boolean(rawSecurity?.compromisedMode?.active),
      activatedAt: Number(rawSecurity?.compromisedMode?.activatedAt || 0),
      reason: String(rawSecurity?.compromisedMode?.reason || ''),
    },
  };

  const oldToNew = [...security.events].reverse();
  let prevHash = 'GENESIS';
  let seq = 0;
  for (const evt of oldToNew) {
    seq += 1;
    evt.seq = Number(evt?.seq || seq);
    evt.prevHash = String(evt?.prevHash || prevHash);
    evt.hash = String(evt?.hash || computeEventHash({ ...evt, prevHash: evt.prevHash, seq: evt.seq }));
    prevHash = evt.hash;
  }

  security.eventChainTip = security.events[0]?.hash || 'GENESIS';
  security.chainValidAt = now();
  return security;
}

function verifyEventChainInternal(events = []) {
  if (!Array.isArray(events) || !events.length) {
    return { valid: true, checked: 0, brokenAtIndex: -1, expected: '', got: '' };
  }

  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    const expectedHash = computeEventHash(evt);
    if (String(evt.hash || '') !== expectedHash) {
      return { valid: false, checked: i + 1, brokenAtIndex: i, expected: expectedHash, got: String(evt.hash || '') };
    }

    if (i < events.length - 1) {
      const next = events[i + 1];
      if (String(evt.prevHash || '') !== String(next.hash || '')) {
        return {
          valid: false,
          checked: i + 1,
          brokenAtIndex: i,
          expected: String(next.hash || ''),
          got: String(evt.prevHash || ''),
        };
      }
    } else if (String(evt.prevHash || 'GENESIS') !== 'GENESIS') {
      return {
        valid: false,
        checked: i + 1,
        brokenAtIndex: i,
        expected: 'GENESIS',
        got: String(evt.prevHash || ''),
      };
    }
  }

  return { valid: true, checked: events.length, brokenAtIndex: -1, expected: '', got: '' };
}

function computeRiskScoreInternal(vaultData) {
  const events = vaultData?.security?.events || [];
  const alerts = vaultData?.security?.breachAlerts || [];
  const nowTs = now();
  const oneDay = 24 * 60 * 60 * 1000;

  let score = 0;
  const factors = [];

  const breachWeight = Math.min(70, alerts.length * 35);
  if (breachWeight > 0) {
    score += breachWeight;
    factors.push(`breach_alerts:${alerts.length}`);
  }

  const recentSensitiveFails = events.filter(
    (e) => e.type === 'sensitive_auth_failed' && nowTs - Number(e.timestamp || 0) <= oneDay
  ).length;
  if (recentSensitiveFails > 0) {
    const w = Math.min(20, recentSensitiveFails * 6);
    score += w;
    factors.push(`sensitive_auth_failed_24h:${recentSensitiveFails}`);
  }

  const recentMailFails = events.filter(
    (e) => e.type === 'mail_failed' && nowTs - Number(e.timestamp || 0) <= oneDay
  ).length;
  if (recentMailFails > 0) {
    const w = Math.min(10, recentMailFails * 3);
    score += w;
    factors.push(`mail_failures_24h:${recentMailFails}`);
  }

  if (vaultData?.security?.compromisedMode?.active) {
    score = Math.max(score, 90);
    factors.push('compromised_mode_active');
  }

  if (vaultData?.settings?.honeyServer?.lastStatus === 'error') {
    score += 8;
    factors.push('honey_server_error');
  }

  score = Math.max(0, Math.min(100, score));
  const severity = score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';

  return {
    score,
    severity,
    factors,
    evaluatedAt: nowTs,
  };
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
    passwords: normalizePasswordEntries(vault.passwords),
    otpAccounts: Array.isArray(vault.otpAccounts) ? vault.otpAccounts : [],
    passkeys: Array.isArray(vault.passkeys) ? vault.passkeys : [],
    notes: Array.isArray(vault.notes) ? vault.notes : [],
    settings: normalizeSettings(vault.settings || {}),
    security: normalizeSecurityState(vault.security || {}),
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

  const security = session.vaultData.security || normalizeSecurityState({});
  session.vaultData.security = security;

  const prevHash = security.events[0]?.hash || 'GENESIS';
  const nextSeq = Number(security.events[0]?.seq || 0) + 1;

  const event = {
    id: makeId(8),
    type,
    message,
    details,
    timestamp: now(),
    seq: nextSeq,
    prevHash,
    hash: '',
  };

  event.hash = computeEventHash(event);

  security.events.unshift(event);
  security.events = security.events.slice(0, 200);
  security.eventChainTip = security.events[0]?.hash || 'GENESIS';

  const verify = verifyEventChainInternal(security.events);
  security.chainValidAt = verify.valid ? now() : Number(security.chainValidAt || 0);
  security.chainBrokenAt = verify.valid ? Number(security.chainBrokenAt || 0) : now();
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
  const entryCount = session.vaultData ? listRealPasswords().length : 0;

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

    if (session.vaultData.settings?.honeyServer?.autoPoll) {
      await checkBreachStatusFromServer(false);
    }

    return {
      success: true,
      message: 'Vault unlocked',
      data: {
        entryCount: decryptedVault.passwords.filter((row) => !row.isDecoy).length,
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
    isDecoy: false,
    decoyMeta: null,
  };
}

function createDecoyUsername(username, index) {
  const safeIndex = index + 1;
  const value = String(username || '').trim();
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    return `${local}+shadow${safeIndex}@${domain}`;
  }
  return `${value}_shadow${safeIndex}`;
}

function createDecoyPassword(password, index) {
  const suffixes = ['#', '!', '%', '$', '&'];
  return `${String(password || '')}${suffixes[index % suffixes.length]}`;
}

function buildDecoyEntriesFromReal(realEntry) {
  const deception = session.vaultData?.settings?.deception || DEFAULT_SETTINGS.deception;
  if (!deception?.enabled) return [];

  const count = normalizeNumber(deception.decoyCount, 2, 0, 5);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const decoyId = makeId(8);
    entries.push({
      ...realEntry,
      id: makeId(8),
      username: createDecoyUsername(realEntry.username, i),
      password: createDecoyPassword(realEntry.password, i),
      createdAt: now(),
      updatedAt: now(),
      lastUsedAt: null,
      isDecoy: true,
      decoyMeta: {
        decoyId,
        serviceName: realEntry.domain || extractDomain(realEntry.url),
        monitoringStatus: false,
        registeredAt: 0,
        lastError: '',
        breachedAt: 0,
      },
    });
  }
  return entries;
}

function listRealPasswords() {
  return session.vaultData.passwords.filter((row) => !row.isDecoy);
}

function listPendingDecoys() {
  return session.vaultData.passwords.filter(
    (row) => row.isDecoy && row.decoyMeta && !row.decoyMeta.monitoringStatus
  );
}

function getAuthHeaders() {
  const honey = getHoneyServerSettings();
  const headers = { 'Content-Type': 'application/json' };
  if (honey.apiToken) headers.Authorization = `Bearer ${honey.apiToken}`;
  return headers;
}

async function postHoney(path, payload) {
  const honey = getHoneyServerSettings();
  const baseUrl = normalizeHoneyBaseUrl(honey.baseUrl);
  if (!baseUrl) {
    return { ok: false, skipped: true, message: 'Honey server URL is not configured' };
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload || {}),
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text || null;
  }

  return { ok: response.ok, status: response.status, body };
}

async function getHoney(path) {
  const honey = getHoneyServerSettings();
  const baseUrl = normalizeHoneyBaseUrl(honey.baseUrl);
  if (!baseUrl) {
    return { ok: false, skipped: true, message: 'Honey server URL is not configured' };
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text || null;
  }

  return { ok: response.ok, status: response.status, body };
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function registerDecoysWithHoneyServer(decoyEntries) {
  requireUnlocked();
  const toRegister = (Array.isArray(decoyEntries) ? decoyEntries : []).filter((entry) => entry?.isDecoy);
  if (!toRegister.length) {
    return { success: true, registered: 0, skipped: 0, failed: 0, message: 'No decoys to register' };
  }

  const honey = getHoneyServerSettings();
  const baseUrl = normalizeHoneyBaseUrl(honey.baseUrl);
  if (!baseUrl) {
    addSecurityEvent('decoy_registration_skipped', 'Decoy registration skipped: server URL is missing');
    return { success: false, registered: 0, skipped: toRegister.length, failed: 0, message: 'Configure Honey Server URL in settings' };
  }

  let registered = 0;
  let failed = 0;

  for (const decoy of toRegister) {
    try {
      const payload = {
        user_id: session.userId,
        decoy_id: decoy.decoyMeta.decoyId,
        username: decoy.username,
        password_hash: await sha256Hex(decoy.password),
        service_name: decoy.decoyMeta.serviceName || decoy.domain || extractDomain(decoy.url),
      };

      const result = await postHoney('/decoy/register', payload);
      if (!result.ok) {
        failed += 1;
        decoy.decoyMeta.lastError = `HTTP ${result.status || 0}`;
        continue;
      }

      decoy.decoyMeta.monitoringStatus = true;
      decoy.decoyMeta.registeredAt = now();
      decoy.decoyMeta.lastError = '';
      registered += 1;
    } catch (error) {
      failed += 1;
      decoy.decoyMeta.lastError = error.message;
    }
  }

  addSecurityEvent('decoy_registration', 'Decoy registration run finished', {
    registered,
    failed,
    total: toRegister.length,
  });
  await persistVault();

  return {
    success: failed === 0,
    registered,
    skipped: 0,
    failed,
    message: failed ? `${registered} registered, ${failed} failed` : `Registered ${registered} decoys`,
  };
}

function normalizeServerAlerts(body) {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.alerts)) return body.alerts;
  if (Array.isArray(body.events)) return body.events;
  return [];
}

async function ingestServerBreachAlerts(alerts) {
  requireUnlocked();
  let added = 0;

  for (const alert of alerts) {
    const decoyId = String(alert?.decoy_id || alert?.decoyId || '').trim();
    if (!decoyId) continue;

    const ts = Number(alert.timestamp || alert.detected_at || now());
    const existing = session.vaultData.security.breachAlerts.some(
      (row) => row.details?.decoyId === decoyId && Number(row.timestamp) === ts
    );
    if (existing) continue;

    const event = {
      id: makeId(8),
      type: 'breach_detected',
      message: 'Vault compromise detected. A decoy credential was used.',
      severity: 'CRITICAL',
      details: {
        decoyId,
        service: alert.service_name || alert.service || 'unknown',
        ip: alert.ip || alert.ip_address || 'unknown',
        source: 'honey_server',
      },
      timestamp: ts,
    };

    session.vaultData.security.breachAlerts.unshift(event);
    addSecurityEvent('breach_detected', event.message, event.details);

    const decoy = session.vaultData.passwords.find((row) => row.isDecoy && row.decoyMeta?.decoyId === decoyId);
    if (decoy?.decoyMeta) {
      decoy.decoyMeta.breachedAt = ts;
      decoy.decoyMeta.monitoringStatus = true;
    }

    added += 1;
  }

  if (added) {
    session.vaultData.security.breachAlerts = session.vaultData.security.breachAlerts.slice(0, 100);
    await persistVault();

    const cloudData = await loadCloud();
    if (cloudData) {
      await sendBreachEmailIfConfigured(session.vaultData.security.breachAlerts[0], cloudData);
    }
  }

  return added;
}

async function checkBreachStatusFromServer(force = false) {
  requireUnlocked();

  const honey = getHoneyServerSettings();
  const baseUrl = normalizeHoneyBaseUrl(honey.baseUrl);
  if (!baseUrl) {
    return { success: false, message: 'Honey server URL not configured', checked: false, added: 0 };
  }

  const intervalMs = Number(honey.pollSeconds || 60) * 1000;
  if (!force && honey.autoPoll && now() - Number(honey.lastCheckedAt || 0) < intervalMs) {
    return { success: true, checked: false, added: 0, message: 'Polling interval not reached yet' };
  }

  try {
    const result = await getHoney(`/alerts?user_id=${encodeURIComponent(session.userId || '')}`);
    if (!result.ok) {
      session.vaultData.settings.honeyServer.lastCheckedAt = now();
      session.vaultData.settings.honeyServer.lastStatus = 'error';
      session.vaultData.settings.honeyServer.lastError = `HTTP ${result.status || 0}`;
      await persistVault();
      return { success: false, checked: true, added: 0, message: session.vaultData.settings.honeyServer.lastError };
    }

    const alerts = normalizeServerAlerts(result.body);
    const added = await ingestServerBreachAlerts(alerts);
    session.vaultData.settings.honeyServer.lastCheckedAt = now();
    session.vaultData.settings.honeyServer.lastStatus = 'ok';
    session.vaultData.settings.honeyServer.lastError = '';
    await persistVault();

    return {
      success: true,
      checked: true,
      added,
      totalAlerts: alerts.length,
      message: added ? `${added} new breach alerts` : 'No new breach alerts',
    };
  } catch (error) {
    session.vaultData.settings.honeyServer.lastCheckedAt = now();
    session.vaultData.settings.honeyServer.lastStatus = 'error';
    session.vaultData.settings.honeyServer.lastError = error.message;
    await persistVault();
    return { success: false, checked: true, added: 0, message: error.message };
  }
}

async function simulateAttack(decoyId = '') {
  requireUnlocked();

  let decoy = null;
  if (decoyId) {
    decoy = session.vaultData.passwords.find(
      (row) => row.isDecoy && row.decoyMeta?.decoyId === String(decoyId)
    );
  }

  if (!decoy) {
    decoy = session.vaultData.passwords.find(
      (row) => row.isDecoy && row.decoyMeta?.monitoringStatus
    );
  }

  if (!decoy) {
    decoy = session.vaultData.passwords.find((row) => row.isDecoy);
  }

  if (!decoy) {
    return { success: false, message: 'No decoy credentials available. Save a password first.' };
  }

  if (!decoy.decoyMeta?.monitoringStatus) {
    const registered = await registerDecoysWithHoneyServer([decoy]);
    if (!registered.success && !registered.registered) {
      return {
        success: false,
        message: `Decoy registration failed before simulation: ${registered.message || 'unknown error'}`,
      };
    }
  }

  let attackResult;
  try {
    attackResult = await postHoney('/auth/login', {
      username: decoy.username,
      password: decoy.password,
      service_name: decoy.decoyMeta?.serviceName || decoy.domain || extractDomain(decoy.url),
    });
  } catch (error) {
    return { success: false, message: `Attack simulation request failed: ${error.message}` };
  }

  const breachCheck = await checkBreachStatusFromServer(true);

  addSecurityEvent('attack_simulated', 'Decoy attack simulation executed', {
    decoyId: decoy.decoyMeta?.decoyId,
    username: decoy.username,
    loginStatus: attackResult?.status || 0,
    alertsAdded: breachCheck?.added || 0,
  });
  await persistVault();

  return {
    success: true,
    message:
      breachCheck?.added > 0
        ? 'Attack simulated and breach alert detected.'
        : 'Attack simulated. No new alert detected yet.',
    data: {
      decoyId: decoy.decoyMeta?.decoyId,
      username: decoy.username,
      loginStatus: attackResult?.status || 0,
      alertCountAdded: breachCheck?.added || 0,
      totalAlerts: breachCheck?.totalAlerts || 0,
    },
  };
}

async function registerPendingDecoys() {
  requireUnlocked();
  return registerDecoysWithHoneyServer(listPendingDecoys());
}

async function getDeceptionStatus() {
  requireUnlocked();
  const total = session.vaultData.passwords.filter((row) => row.isDecoy).length;
  const registered = session.vaultData.passwords.filter(
    (row) => row.isDecoy && row.decoyMeta?.monitoringStatus
  ).length;
  const breached = session.vaultData.passwords.filter(
    (row) => row.isDecoy && Number(row.decoyMeta?.breachedAt || 0) > 0
  ).length;

  return {
    success: true,
    data: {
      totalDecoys: total,
      registeredDecoys: registered,
      pendingDecoys: Math.max(0, total - registered),
      breachedDecoys: breached,
      honeyServer: session.vaultData.settings.honeyServer,
    },
  };
}

async function addPassword(entry) {
  requireUnlocked();
  const clean = sanitizePasswordEntry(entry);
  const decoys = buildDecoyEntriesFromReal(clean);

  session.vaultData.passwords.push(clean, ...decoys);
  addSecurityEvent('password_added', 'Password entry added', {
    domain: clean.domain,
    decoyCount: decoys.length,
  });
  await persistVault();

  if (decoys.length) {
    await registerDecoysWithHoneyServer(decoys);
  }

  await maybeSetRecipientAndSendWelcome(clean.username);
  return { success: true, data: clean, decoyCount: decoys.length };
}

function findPasswordsForUrl(url, includeDecoys = false) {
  const domain = extractDomain(url);
  const source = includeDecoys ? session.vaultData.passwords : listRealPasswords();
  return source.filter((p) => p.domain === domain);
}

async function getPasswords(url, includeDecoys = false) {
  if (!session.isUnlocked || !session.vaultData) {
    return { success: false, message: 'Vault is locked', requiresUnlock: true, data: [] };
  }
  return { success: true, data: findPasswordsForUrl(url, includeDecoys) };
}

async function getAllPasswords(includeDecoys = false) {
  requireUnlocked();
  return { success: true, data: includeDecoys ? session.vaultData.passwords : listRealPasswords() };
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

  const existing = listRealPasswords().find(
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

  const current = normalizeSettings(session.vaultData.settings || {});
  const incoming = settings || {};

  const nextSettings = normalizeSettings({
    ...current,
    ...incoming,
    deception: {
      ...current.deception,
      ...(incoming.deception || {}),
    },
    honeyServer: {
      ...current.honeyServer,
      ...(incoming.honeyServer || {}),
      baseUrl: String(incoming.honeyServer?.baseUrl ?? current.honeyServer.baseUrl ?? '').trim(),
      apiToken: String(incoming.honeyServer?.apiToken ?? current.honeyServer.apiToken ?? '').trim(),
    },
    mailService: {
      ...current.mailService,
      ...(incoming.mailService || {}),
      toEmail: (incoming.mailService?.toEmail || incoming.alertEmail || current.mailService.toEmail || '').trim(),
    },
  });

  session.vaultData.settings = nextSettings;
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


async function getRiskScore() {
  requireUnlocked();
  return { success: true, data: computeRiskScoreInternal(session.vaultData) };
}

async function verifySecurityLogs() {
  requireUnlocked();
  const result = verifyEventChainInternal(session.vaultData.security?.events || []);
  return { success: true, data: result };
}

async function activateCompromisedMode(reason = 'manual_activation') {
  requireUnlocked();

  session.vaultData.settings.autoFill = false;
  session.vaultData.settings.savePrompts = false;
  session.vaultData.settings.breachAlerts = true;

  session.vaultData.security.compromisedMode = {
    active: true,
    activatedAt: now(),
    reason: String(reason || 'manual_activation'),
  };

  addSecurityEvent('compromised_mode_activated', 'Compromised mode activated by user', {
    reason,
    actions: ['autofill_disabled', 'save_prompts_disabled', 'high_alert_mode'],
  });

  await persistVault();
  return {
    success: true,
    message: 'Compromised mode activated. Vault moved to high-alert safety mode.',
    data: {
      activatedAt: session.vaultData.security.compromisedMode.activatedAt,
      settings: {
        autoFill: session.vaultData.settings.autoFill,
        savePrompts: session.vaultData.settings.savePrompts,
        breachAlerts: session.vaultData.settings.breachAlerts,
      },
    },
  };
}

async function getSecurityEvents() {
  requireUnlocked();

  const risk = computeRiskScoreInternal(session.vaultData);
  const chain = verifyEventChainInternal(session.vaultData.security?.events || []);

  return {
    success: true,
    data: {
      events: session.vaultData.security.events,
      breachAlerts: session.vaultData.security.breachAlerts,
      compromisedMode: session.vaultData.security.compromisedMode || { active: false, activatedAt: 0, reason: '' },
      risk,
      logIntegrity: chain,
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
          response = await getPasswords(request.url, request.includeDecoys === true);
          break;
        case 'GET_ALL_PASSWORDS':
          response = await getAllPasswords(request.includeDecoys === true);
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
        case 'GET_RISK_SCORE':
          response = await getRiskScore();
          break;
        case 'VERIFY_SECURITY_LOGS':
          response = await verifySecurityLogs();
          break;
        case 'ACTIVATE_COMPROMISED_MODE':
          response = await activateCompromisedMode(request.reason || 'manual_activation');
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
        case 'REGISTER_PENDING_DECOYS':
          response = await registerPendingDecoys();
          break;
        case 'CHECK_BREACH_STATUS':
          response = await checkBreachStatusFromServer(Boolean(request.force));
          break;
        case 'SIMULATE_ATTACK':
          response = await simulateAttack(request.decoyId || '');
          break;
        case 'GET_DECEPTION_STATUS':
          response = await getDeceptionStatus();
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
