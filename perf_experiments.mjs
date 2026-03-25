import { CasperCore } from './casper-extension/background/casper-core.js';
import { spawn } from 'node:child_process';
import process from 'node:process';

const core = new CasperCore();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length) - 1))];
  return {
    n: sorted.length,
    mean,
    min: sorted[0],
    p50: pct(50),
    p95: pct(95),
    max: sorted[sorted.length - 1],
  };
}

function fmt(x) {
  return Number(x).toFixed(2);
}

async function timeAsync(fn, runs = 20) {
  const arr = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await fn(i);
    arr.push(performance.now() - t0);
  }
  return stats(arr);
}

function buildVaultPayload(entries = 100) {
  const passwords = [];
  const notes = [];
  for (let i = 0; i < entries; i++) {
    passwords.push({
      id: `id-${i}`,
      url: `https://site${i}.example.com/login`,
      domain: `site${i}.example.com`,
      title: `Site ${i}`,
      username: `user${i}@example.com`,
      password: `Pw${i}!Abc${i * 3}`,
      notes: 'benchmark',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastUsedAt: null,
    });
    notes.push({ id: `note-${i}`, title: `Note ${i}`, content: 'x'.repeat(120), createdAt: Date.now(), updatedAt: Date.now() });
  }
  return {
    version: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    passwords,
    otpAccounts: [],
    passkeys: [],
    notes,
    decoyCredentials: [],
    settings: {
      autoFill: true,
      autoLockMinutes: 5,
      breachAlerts: true,
      syncEnabled: true,
      auth: { maxUnlockAttempts: 5, lockoutMinutes: 5, otpDefaultPeriod: 30, otpGraceWindows: 1 },
      deception: { monitoringEnabled: true, honeyServerUrl: 'http://localhost:8790', honeyApiKey: '', decoyCount: 3, pollIntervalSeconds: 60 },
      mailService: { toEmail: '' },
    },
    security: { events: [], breachAlerts: [], failedUnlocks: 0, lockoutUntil: 0, recoveryCodeHashes: [], usedRecoveryCodeHashes: [], lastHoneyCheckAt: 0 },
  };
}

async function benchmarkCrypto() {
  const secrets = core.generateDetectionSecrets(5);
  const salt = core.generateSalt();
  const selectorSalt = core.generateSelectorSalt();

  const deriveStats = await timeAsync(async () => {
    const { secret } = await core.selectSecret(secrets, '1234', selectorSalt);
    await core.deriveEncryptionKey('1234', secret, salt);
  }, 25);

  const { secret } = await core.selectSecret(secrets, '1234', selectorSalt);
  const key = await core.deriveEncryptionKey('1234', secret, salt);

  const payloadSmall = buildVaultPayload(10);
  const payloadLarge = buildVaultPayload(200);

  const encSmall = await timeAsync(async () => {
    await core.encryptJson(payloadSmall, key);
  }, 40);

  const encLarge = await timeAsync(async () => {
    await core.encryptJson(payloadLarge, key);
  }, 25);

  const encryptedLarge = await core.encryptJson(payloadLarge, key);
  const decLarge = await timeAsync(async () => {
    await core.decryptJson(encryptedLarge, key);
  }, 25);

  const otpAccount = {
    type: 'totp',
    issuer: 'Bench',
    label: 'user@example.com',
    secret: 'JBSWY3DPEHPK3PXP',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    counter: 0,
  };

  const otpStats = await timeAsync(async () => {
    await core.generateOtpCode(otpAccount, Date.now());
  }, 80);

  return {
    deriveStats,
    encSmall,
    encLarge,
    decLarge,
    otpStats,
  };
}

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await sleep(200);
  }
  return false;
}

async function benchmarkApi(baseUrl = 'http://localhost:8790') {
  const sample = async (fn, runs = 20) => {
    const arr = [];
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      await fn(i);
      arr.push(performance.now() - t0);
    }
    return stats(arr);
  };

  const registerStats = await sample(async (i) => {
    const uname = `bench.user.${Date.now()}.${i}`;
    const resp = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_name: 'dummy-auth.local', username: uname, password: 'DemoPass@1234' }),
    });
    if (!resp.ok) throw new Error('register failed');
  }, 25);

  const loginOkStats = await sample(async () => {
    const resp = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_name: 'dummy-auth.local', username: 'demo.user', password: 'DemoPass@123' }),
    });
    if (!resp.ok) throw new Error('login ok failed');
  }, 30);

  const loginBadStats = await sample(async (i) => {
    const resp = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_name: 'dummy-auth.local', username: `bad.user.${i}`, password: 'WrongPass@123' }),
    });
    if (resp.status !== 401) throw new Error('expected 401');
  }, 30);

  const decoyIds = [];
  const decoyRegStats = await sample(async (i) => {
    const decoyId = `bench-decoy-${Date.now()}-${i}`;
    decoyIds.push(decoyId);
    const payload = {
      user_id: 'bench-user',
      decoy_id: decoyId,
      username: `bench+shadow${i}@example.com`,
      password_hash: 'b4f0f9fd0f4f7075f545286f6f593ceff1488a5472f14e1088db00f7afac8f8e',
      service_name: 'dummy-auth.local',
    };
    const resp = await fetch(`${baseUrl}/decoy/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error('decoy register failed');
  }, 20);

  const decoyCheckStats = await sample(async () => {
    const resp = await fetch(`${baseUrl}/decoy/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 'bench-user', decoy_ids: decoyIds.slice(0, 10), monitor_services: ['dummy-auth.local'] }),
    });
    if (!resp.ok) throw new Error('decoy check failed');
  }, 30);

  return { registerStats, loginOkStats, loginBadStats, decoyRegStats, decoyCheckStats };
}

async function run() {
  const server = spawn('node', ['./dummy-site/server.js'], {
    cwd: '/Users/mohan/casper_web_extension',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});

  let started = false;
  try {
    started = await waitForServer('http://localhost:8790/health', 12000);
    if (!started) throw new Error('dummy server did not start');

    const cryptoResults = await benchmarkCrypto();
    const apiResults = await benchmarkApi('http://localhost:8790');

    const output = {
      runAt: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      crypto: {
        derive_key_ms: cryptoResults.deriveStats,
        encrypt_small_10_entries_ms: cryptoResults.encSmall,
        encrypt_large_200_entries_ms: cryptoResults.encLarge,
        decrypt_large_200_entries_ms: cryptoResults.decLarge,
        otp_generate_totp_ms: cryptoResults.otpStats,
      },
      api: {
        auth_register_ms: apiResults.registerStats,
        auth_login_success_ms: apiResults.loginOkStats,
        auth_login_failure_ms: apiResults.loginBadStats,
        decoy_register_ms: apiResults.decoyRegStats,
        decoy_check_ms: apiResults.decoyCheckStats,
      },
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    if (server && !server.killed) {
      server.kill('SIGTERM');
      await sleep(300);
      if (!server.killed) server.kill('SIGKILL');
    }
  }
}

run().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
});
