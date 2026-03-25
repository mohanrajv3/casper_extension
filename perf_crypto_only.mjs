import { CasperCore } from './casper-extension/background/casper-core.js';
import process from 'node:process';

const core = new CasperCore();

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return { n: sorted.length, mean, min: sorted[0], p50: at(50), p95: at(95), max: sorted[sorted.length - 1] };
}

async function time(fn, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fn(i);
    out.push(performance.now() - t0);
  }
  return stats(out);
}

function buildPayload(entries) {
  const passwords = [];
  for (let i = 0; i < entries; i++) {
    passwords.push({ id: `${i}`, url: `https://s${i}.com`, domain: `s${i}.com`, title: `S${i}`, username: `u${i}`, password: `P@${i}` });
  }
  return { passwords, notes: Array.from({ length: entries }, (_, i) => ({ id: `${i}`, title: `N${i}`, content: 'x'.repeat(80) })), security: { events: [], breachAlerts: [] } };
}

const secrets = core.generateDetectionSecrets(5);
const salt = core.generateSalt();
const selectorSalt = core.generateSelectorSalt();

const derive = await time(async () => {
  const { secret } = await core.selectSecret(secrets, '1234', selectorSalt);
  await core.deriveEncryptionKey('1234', secret, salt);
}, 20);

const { secret } = await core.selectSecret(secrets, '1234', selectorSalt);
const key = await core.deriveEncryptionKey('1234', secret, salt);

const small = buildPayload(10);
const medium = buildPayload(100);
const large = buildPayload(300);

const encSmall = await time(async () => { await core.encryptJson(small, key); }, 40);
const encMed = await time(async () => { await core.encryptJson(medium, key); }, 30);
const encLarge = await time(async () => { await core.encryptJson(large, key); }, 20);

const blobLarge = await core.encryptJson(large, key);
const decLarge = await time(async () => { await core.decryptJson(blobLarge, key); }, 20);

const otpAccount = { type: 'totp', issuer: 'Bench', label: 'u', secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA1', digits: 6, period: 30, counter: 0 };
const otp = await time(async () => { await core.generateOtpCode(otpAccount, Date.now()); }, 80);

console.log(JSON.stringify({
  runAt: new Date().toISOString(),
  env: { node: process.version, platform: process.platform, arch: process.arch },
  results: {
    derive_key_ms: derive,
    encrypt_10_entries_ms: encSmall,
    encrypt_100_entries_ms: encMed,
    encrypt_300_entries_ms: encLarge,
    decrypt_300_entries_ms: decLarge,
    otp_generate_totp_ms: otp,
  }
}, null, 2));
