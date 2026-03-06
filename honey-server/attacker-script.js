#!/usr/bin/env node

// Usage:
// node attacker-script.js --username user+shadow1@example.com --password MyPass# --service example.com

const http = require('http');

function parseArgs(argv) {
  const out = {
    url: 'http://127.0.0.1:8787/auth/login',
    username: '',
    password: '',
    service: '',
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--url' && next) {
      out.url = next;
      i += 1;
    } else if (arg === '--username' && next) {
      out.username = next;
      i += 1;
    } else if (arg === '--password' && next) {
      out.password = next;
      i += 1;
    } else if (arg === '--service' && next) {
      out.service = next;
      i += 1;
    }
  }
  return out;
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(payload);

    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, body: text });
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const args = parseArgs(process.argv);
  if (!args.username || !args.password) {
    console.error('Missing required args: --username and --password');
    process.exit(1);
  }

  const payload = {
    username: args.username,
    password: args.password,
    service_name: args.service || undefined,
  };

  const result = await postJson(args.url, payload);
  console.log('Status:', result.status);
  console.log('Body:', result.body);
})();
