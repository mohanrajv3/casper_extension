#!/usr/bin/env node

const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || process.env.HONEY_PORT || 8787);
const HOST = process.env.HONEY_HOST || '0.0.0.0';
const API_TOKEN = String(process.env.HONEY_API_TOKEN || '').trim();
const DATA_DIR = process.env.HONEY_DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = process.env.HONEY_DATA_FILE || path.join(DATA_DIR, 'store.json');

function now() {
  return Date.now();
}

function makeId(bytes = 8) {
  return crypto.randomBytes(bytes).toString('hex');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function ensureDataFile() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      version: 1,
      created_at: now(),
      decoys: [],
      alerts: [],
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function loadStore() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      created_at: parsed.created_at || now(),
      decoys: Array.isArray(parsed.decoys) ? parsed.decoys : [],
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
    };
  } catch {
    return {
      version: 1,
      created_at: now(),
      decoys: [],
      alerts: [],
    };
  }
}

function saveStore(store) {
  ensureDataFile();
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(temp, DATA_FILE);
}

function writeJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(body));
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  const socket = req.socket?.remoteAddress || '';
  return String(socket).replace(/^::ffff:/, '');
}

function isAuthorized(req) {
  if (!API_TOKEN) return true;
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice('Bearer '.length).trim();
  return token === API_TOKEN;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function handleHealth(_req, res) {
  writeJson(res, 200, {
    success: true,
    service: 'casper-honey-server',
    now: now(),
    data_file: DATA_FILE,
  });
}

function handleRegisterDecoy(req, res) {
  readBody(req)
    .then((body) => {
      const userId = String(body.user_id || 'default').trim();
      const decoyId = String(body.decoy_id || '').trim();
      const username = String(body.username || '').trim();
      const passwordHash = String(body.password_hash || '').trim().toLowerCase();
      const serviceName = String(body.service_name || '').trim();

      if (!decoyId || !username || !passwordHash || !serviceName) {
        writeJson(res, 400, { success: false, message: 'Missing required fields' });
        return;
      }

      if (!/^[a-f0-9]{64}$/.test(passwordHash)) {
        writeJson(res, 400, { success: false, message: 'password_hash must be SHA-256 hex' });
        return;
      }

      const store = loadStore();
      const existingIndex = store.decoys.findIndex(
        (row) => row.user_id === userId && row.decoy_id === decoyId
      );

      const next = {
        user_id: userId,
        decoy_id: decoyId,
        username,
        password_hash: passwordHash,
        service_name: serviceName,
        created_at: now(),
        updated_at: now(),
        trigger_count: 0,
        last_seen_ip: '',
        last_seen_at: 0,
      };

      if (existingIndex >= 0) {
        const prev = store.decoys[existingIndex];
        store.decoys[existingIndex] = {
          ...prev,
          ...next,
          created_at: prev.created_at || next.created_at,
        };
      } else {
        store.decoys.push(next);
      }

      saveStore(store);
      writeJson(res, 200, {
        success: true,
        registered: true,
        decoy_id: decoyId,
        user_id: userId,
      });
    })
    .catch((error) => writeJson(res, 400, { success: false, message: error.message }));
}

function handleDecoyCheck(req, res) {
  readBody(req)
    .then((body) => {
      const decoyIds = Array.isArray(body.decoy_ids)
        ? body.decoy_ids.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      const lastCheckedAt = Number(body.last_checked_at || 0);
      const since = Number.isFinite(lastCheckedAt) && lastCheckedAt > 0 ? lastCheckedAt : 0;

      if (!decoyIds.length) {
        writeJson(res, 200, {
          success: true,
          breach_detected: false,
          events: [],
          total: 0,
        });
        return;
      }

      const decoySet = new Set(decoyIds);
      const store = loadStore();
      const events = store.alerts
        .filter((row) => decoySet.has(String(row.decoy_id || '')))
        .filter((row) => Number(row.timestamp || 0) > since)
        .slice(0, 500)
        .map((row) => ({
          decoy_id: row.decoy_id,
          ip_address: row.ip,
          timestamp: row.timestamp,
          service_name: row.service_name,
        }));

      writeJson(res, 200, {
        success: true,
        breach_detected: events.length > 0,
        events,
        total: events.length,
      });
    })
    .catch((error) => writeJson(res, 400, { success: false, message: error.message }));
}

function handleAuthLogin(req, res) {
  readBody(req)
    .then((body) => {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const serviceName = String(body.service_name || '').trim();

      if (!username || !password) {
        writeJson(res, 400, { success: false, message: 'username and password are required' });
        return;
      }

      const hashed = sha256Hex(password);
      const store = loadStore();

      const matched = store.decoys.find((row) => {
        if (row.username !== username) return false;
        if (row.password_hash !== hashed) return false;
        if (serviceName && row.service_name !== serviceName) return false;
        return true;
      });

      if (matched) {
        const ts = now();
        const ip = getClientIp(req);
        const alert = {
          id: makeId(8),
          user_id: matched.user_id,
          decoy_id: matched.decoy_id,
          service_name: matched.service_name,
          ip,
          timestamp: ts,
        };

        store.alerts.unshift(alert);
        if (store.alerts.length > 10000) {
          store.alerts = store.alerts.slice(0, 10000);
        }

        matched.trigger_count = Number(matched.trigger_count || 0) + 1;
        matched.last_seen_ip = ip;
        matched.last_seen_at = ts;
        matched.updated_at = ts;

        saveStore(store);
      }

      writeJson(res, 401, {
        success: false,
        message: 'Invalid credentials',
      });
    })
    .catch((error) => writeJson(res, 400, { success: false, message: error.message }));
}

function handleAlerts(req, res, parsedUrl) {
  const userId = String(parsedUrl.searchParams.get('user_id') || '').trim();
  const since = Number(parsedUrl.searchParams.get('since') || 0);

  const store = loadStore();
  let alerts = store.alerts;
  if (userId) {
    alerts = alerts.filter((row) => row.user_id === userId);
  }
  if (Number.isFinite(since) && since > 0) {
    alerts = alerts.filter((row) => Number(row.timestamp) > since);
  }

  writeJson(res, 200, {
    success: true,
    alerts: alerts.slice(0, 500),
    total: alerts.length,
  });
}

function handleDecoys(req, res, parsedUrl) {
  const userId = String(parsedUrl.searchParams.get('user_id') || '').trim();
  const store = loadStore();
  const decoys = userId
    ? store.decoys.filter((row) => row.user_id === userId)
    : store.decoys;

  writeJson(res, 200, {
    success: true,
    decoys: decoys.map((row) => ({
      user_id: row.user_id,
      decoy_id: row.decoy_id,
      username: row.username,
      service_name: row.service_name,
      created_at: row.created_at,
      trigger_count: row.trigger_count,
      last_seen_ip: row.last_seen_ip,
      last_seen_at: row.last_seen_at,
    })),
    total: decoys.length,
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const route = parsedUrl.pathname;

  if (req.method === 'OPTIONS') {
    writeJson(res, 204, { success: true });
    return;
  }

  if (route === '/health' && req.method === 'GET') {
    handleHealth(req, res);
    return;
  }

  if (route === '/' && req.method === 'GET') {
    writeJson(res, 200, {
      success: true,
      service: 'casper-honey-server',
      message: 'Server is running',
      endpoints: ['/health', '/decoy/register', '/decoy/check', '/auth/login', '/alerts', '/decoys'],
    });
    return;
  }

  if (!isAuthorized(req)) {
    writeJson(res, 401, { success: false, message: 'Unauthorized' });
    return;
  }

  if (route === '/decoy/register' && req.method === 'POST') {
    handleRegisterDecoy(req, res);
    return;
  }

  if (route === '/auth/login' && req.method === 'POST') {
    handleAuthLogin(req, res);
    return;
  }

  if (route === '/decoy/check' && req.method === 'POST') {
    handleDecoyCheck(req, res);
    return;
  }

  if (route === '/alerts' && req.method === 'GET') {
    handleAlerts(req, res, parsedUrl);
    return;
  }

  if (route === '/decoys' && req.method === 'GET') {
    handleDecoys(req, res, parsedUrl);
    return;
  }

  writeJson(res, 404, { success: false, message: 'Not Found' });
});

server.listen(PORT, HOST, () => {
  ensureDataFile();
  console.log(`CASPER Honey Server listening at http://${HOST}:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
  if (API_TOKEN) {
    console.log('Auth: Bearer token required');
  } else {
    console.log('Auth: disabled (set HONEY_API_TOKEN to enable)');
  }
});
