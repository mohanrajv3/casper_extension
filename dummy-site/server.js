#!/usr/bin/env node

const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || process.env.DUMMY_PORT || 8790);
const HOST = process.env.DUMMY_HOST || '0.0.0.0';
const API_TOKEN = String(process.env.HONEY_API_TOKEN || '').trim();
const DATA_DIR = process.env.DUMMY_DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = process.env.DUMMY_DATA_FILE || path.join(DATA_DIR, 'store.json');

function now() {
  return Date.now();
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function makeId(bytes = 8) {
  return crypto.randomBytes(bytes).toString('hex');
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      version: 1,
      created_at: now(),
      users: [
        {
          id: 'demo-user',
          username: 'demo.user',
          password_hash: sha256Hex('DemoPass@123'),
          service_name: 'dummy-auth.local',
          created_at: now(),
        },
      ],
      decoys: [],
      alerts: [],
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function loadStore() {
  ensureStore();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    version: 1,
    created_at: parsed.created_at || now(),
    users: Array.isArray(parsed.users) ? parsed.users : [],
    decoys: Array.isArray(parsed.decoys) ? parsed.decoys : [],
    alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
  };
}

function saveStore(store) {
  ensureStore();
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

function isAuthorized(req) {
  if (!API_TOKEN) return true;
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return false;
  return auth.slice('Bearer '.length).trim() === API_TOKEN;
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function addAlert(store, event) {
  store.alerts.unshift({
    id: makeId(8),
    timestamp: now(),
    ...event,
  });
  store.alerts = store.alerts.slice(0, 5000);
}

function handleRoot(_req, res) {
  const html = fs.readFileSync(path.join(__dirname, 'site', 'home.html'), 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function handlePage(res, pageName) {
  const target = path.join(__dirname, 'site', pageName);
  if (!fs.existsSync(target)) {
    writeJson(res, 404, { success: false, message: 'Not found' });
    return;
  }
  const html = fs.readFileSync(target, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function handleAsset(req, res, pathname) {
  const rel = pathname.replace(/^\/+/, '');
  const target = path.join(__dirname, rel);
  if (!target.startsWith(path.join(__dirname, 'site'))) {
    writeJson(res, 404, { success: false, message: 'Not found' });
    return;
  }
  if (!fs.existsSync(target)) {
    writeJson(res, 404, { success: false, message: 'Not found' });
    return;
  }
  const contentType = target.endsWith('.js')
    ? 'application/javascript; charset=utf-8'
    : target.endsWith('.css')
      ? 'text/css; charset=utf-8'
      : 'text/plain; charset=utf-8';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(fs.readFileSync(target));
}

function handleHealth(_req, res) {
  writeJson(res, 200, { success: true, service: 'casper-dummy-site', now: now(), data_file: DATA_FILE });
}

function handleRegisterDecoy(req, res) {
  readBody(req)
    .then((body) => {
      const userId = String(body.user_id || 'default').trim();
      const decoyId = String(body.decoy_id || '').trim();
      const username = String(body.username || '').trim();
      const passwordHash = String(body.password_hash || '').trim().toLowerCase();
      const serviceName = String(body.service_name || '').trim() || 'dummy-auth.local';
      if (!decoyId || !username || !passwordHash) {
        writeJson(res, 400, { success: false, message: 'Missing required fields' });
        return;
      }
      if (!/^[a-f0-9]{64}$/.test(passwordHash)) {
        writeJson(res, 400, { success: false, message: 'password_hash must be SHA-256 hex' });
        return;
      }
      const store = loadStore();
      const idx = store.decoys.findIndex((d) => d.user_id === userId && d.decoy_id === decoyId);
      const row = {
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
      if (idx >= 0) {
        store.decoys[idx] = { ...store.decoys[idx], ...row, created_at: store.decoys[idx].created_at || row.created_at };
      } else {
        store.decoys.push(row);
      }
      saveStore(store);
      writeJson(res, 200, { success: true, registered: true, decoy_id: decoyId, user_id: userId });
    })
    .catch((error) => writeJson(res, 400, { success: false, message: error.message }));
}

function handleAuthLogin(req, res) {
  readBody(req)
    .then((body) => {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const fallbackService = String(req.headers.host || '127.0.0.1').split(':')[0];
      const serviceName = String(body.service_name || fallbackService).trim();
      if (!username || !password) {
        writeJson(res, 400, { success: false, message: 'username and password are required' });
        return;
      }

      const store = loadStore();
      const hashed = sha256Hex(password);
      const ip = getClientIp(req);

      const decoyUser = store.decoys.find((d) => d.username === username && d.service_name === serviceName);
      if (decoyUser) {
        if (decoyUser.password_hash === hashed) {
          decoyUser.trigger_count = Number(decoyUser.trigger_count || 0) + 1;
          decoyUser.last_seen_ip = ip;
          decoyUser.last_seen_at = now();
          decoyUser.updated_at = now();
          addAlert(store, {
            event_type: 'decoy_used',
            severity: 'CRITICAL',
            user_id: decoyUser.user_id,
            decoy_id: decoyUser.decoy_id,
            username,
            service_name: serviceName,
            ip_address: ip,
          });
        } else {
          addAlert(store, {
            event_type: 'wrong_password_decoy_probe',
            severity: 'MEDIUM',
            user_id: decoyUser.user_id,
            decoy_id: decoyUser.decoy_id,
            username,
            service_name: serviceName,
            ip_address: ip,
          });
        }
        saveStore(store);
        writeJson(res, 401, { success: false, message: 'Invalid credentials' });
        return;
      }

      const user = store.users.find((u) => u.username === username && u.service_name === serviceName);
      if (user && user.password_hash === hashed) {
        writeJson(res, 200, { success: true, message: 'Login successful' });
        return;
      }

      addAlert(store, {
        event_type: 'wrong_password',
        severity: 'LOW',
        user_id: 'unknown',
        decoy_id: '',
        username,
        service_name: serviceName,
        ip_address: ip,
      });
      saveStore(store);
      writeJson(res, 401, { success: false, message: 'Invalid credentials' });
    })
    .catch((error) => writeJson(res, 400, { success: false, message: error.message }));
}

function handleAuthRegister(req, res) {
  readBody(req)
    .then((body) => {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const fallbackService = String(req.headers.host || '127.0.0.1').split(':')[0];
      const serviceName = String(body.service_name || fallbackService).trim();
      if (!username || !password) {
        writeJson(res, 400, { success: false, message: 'username and password are required' });
        return;
      }
      if (password.length < 6) {
        writeJson(res, 400, { success: false, message: 'password must be at least 6 characters' });
        return;
      }

      const store = loadStore();
      const exists = store.users.some((u) => u.username === username && u.service_name === serviceName);
      if (exists) {
        writeJson(res, 409, { success: false, message: 'Account already exists' });
        return;
      }
      store.users.push({
        id: makeId(8),
        username,
        password_hash: sha256Hex(password),
        service_name: serviceName,
        created_at: now(),
      });
      saveStore(store);
      writeJson(res, 200, { success: true, message: 'Account registered' });
    })
    .catch((error) => writeJson(res, 400, { success: false, message: error.message }));
}

function handleDecoyCheck(req, res) {
  readBody(req)
    .then((body) => {
      const decoyIds = Array.isArray(body.decoy_ids) ? body.decoy_ids.map((x) => String(x || '').trim()).filter(Boolean) : [];
      const monitorServices = Array.isArray(body.monitor_services)
        ? body.monitor_services.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      const includeAuthFailures = Boolean(body.include_auth_failures);
      const userId = String(body.user_id || '').trim();
      const since = Math.max(0, Number(body.last_checked_at || 0));

      const store = loadStore();
      const decoySet = new Set(decoyIds);
      const serviceSet = new Set(monitorServices);

      const events = store.alerts.filter((evt) => {
        const ts = Number(evt.timestamp || 0);
        if (ts <= since) return false;
        if (decoySet.has(String(evt.decoy_id || ''))) return true;
        if (
          includeAuthFailures &&
          String(evt.event_type || '').startsWith('wrong_password') &&
          serviceSet.has(String(evt.service_name || ''))
        ) {
          if (!userId) return true;
          if (evt.user_id === userId || evt.user_id === 'unknown') return true;
        }
        return false;
      }).slice(0, 500);

      const normalized = events.map((evt) => ({
        event_type: evt.event_type || 'unknown',
        severity: evt.severity || 'LOW',
        decoy_id: evt.decoy_id || '',
        username: evt.username || '',
        service_name: evt.service_name || '',
        ip_address: evt.ip_address || '',
        timestamp: evt.timestamp || now(),
      }));

      const breachDetected = normalized.some((e) => e.event_type === 'decoy_used');
      writeJson(res, 200, {
        success: true,
        breach_detected: breachDetected,
        events: normalized,
        total: normalized.length,
      });
    })
    .catch((error) => writeJson(res, 400, { success: false, message: error.message }));
}

function handleAlerts(req, res, parsedUrl) {
  const since = Math.max(0, Number(parsedUrl.searchParams.get('since') || 0));
  const store = loadStore();
  const alerts = store.alerts.filter((a) => Number(a.timestamp || 0) > since).slice(0, 500);
  writeJson(res, 200, { success: true, alerts, total: alerts.length });
}

function handleDecoys(_req, res) {
  const store = loadStore();
  writeJson(res, 200, {
    success: true,
    decoys: store.decoys.map((d) => ({
      user_id: d.user_id,
      decoy_id: d.decoy_id,
      username: d.username,
      service_name: d.service_name,
      trigger_count: d.trigger_count,
      last_seen_ip: d.last_seen_ip,
      last_seen_at: d.last_seen_at,
    })),
    total: store.decoys.length,
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const route = parsedUrl.pathname;

  if (req.method === 'OPTIONS') {
    writeJson(res, 204, { success: true });
    return;
  }

  if (route === '/' && req.method === 'GET') return handleRoot(req, res);
  if (route === '/login' && req.method === 'GET') return handlePage(res, 'login.html');
  if (route === '/register' && req.method === 'GET') return handlePage(res, 'register.html');
  if (route === '/workouts' && req.method === 'GET') return handlePage(res, 'workouts.html');
  if (route === '/dashboard' && req.method === 'GET') return handlePage(res, 'dashboard.html');
  if (route === '/site/app.js' && req.method === 'GET') return handleAsset(req, res, route);
  if (route === '/site/style.css' && req.method === 'GET') return handleAsset(req, res, route);
  if (route === '/health' && req.method === 'GET') return handleHealth(req, res);
  if (route === '/auth/register' && req.method === 'POST') return handleAuthRegister(req, res);
  if (route === '/auth/login' && req.method === 'POST') return handleAuthLogin(req, res);

  if (!isAuthorized(req)) {
    writeJson(res, 401, { success: false, message: 'Unauthorized' });
    return;
  }

  if (route === '/decoy/register' && req.method === 'POST') return handleRegisterDecoy(req, res);
  if (route === '/decoy/check' && req.method === 'POST') return handleDecoyCheck(req, res);
  if (route === '/alerts' && req.method === 'GET') return handleAlerts(req, res, parsedUrl);
  if (route === '/decoys' && req.method === 'GET') return handleDecoys(req, res);

  writeJson(res, 404, { success: false, message: 'Not Found' });
});

server.listen(PORT, HOST, () => {
  ensureStore();
  console.log(`CASPER Dummy Site listening at http://${HOST}:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
  if (API_TOKEN) console.log('Protected APIs require bearer token');
});
