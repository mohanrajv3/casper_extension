const BASE = 'https://casper-extension.onrender.com';
const TOKEN = 'c01c88b8f2d6f892f8da76c448753203';

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return { n: sorted.length, mean, min: sorted[0], p50: at(50), p95: at(95), max: sorted[sorted.length - 1] };
}

async function sample(fn, n = 20) {
  const times = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fn(i);
    times.push(performance.now() - t0);
  }
  return stats(times);
}

async function run() {
  const health = await sample(async () => {
    const r = await fetch(`${BASE}/health`);
    if (!r.ok) throw new Error('health failed');
    await r.text();
  }, 25);

  const decoysResp = await fetch(`${BASE}/decoys`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const decoysJson = await decoysResp.json();
  const decoyIds = (decoysJson.decoys || []).slice(0, 10).map((d) => d.decoy_id).filter(Boolean);

  const decoysList = await sample(async () => {
    const r = await fetch(`${BASE}/decoys`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r.ok) throw new Error('decoys failed');
    await r.text();
  }, 20);

  const decoyCheck = await sample(async () => {
    const r = await fetch(`${BASE}/decoy/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ user_id: 'default', decoy_ids: decoyIds, monitor_services: ['instagram.com'] }),
    });
    if (!r.ok) throw new Error('decoy check failed');
    await r.text();
  }, 20);

  const authLogin = await sample(async (i) => {
    const r = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ username: `bench.${Date.now()}.${i}@example.com`, password: 'WrongPass@123' }),
    });
    if (r.status !== 401 && r.status !== 200) throw new Error(`auth status ${r.status}`);
    await r.text();
  }, 20);

  console.log(JSON.stringify({
    runAt: new Date().toISOString(),
    base: BASE,
    results: {
      health_ms: health,
      decoys_list_ms: decoysList,
      decoy_check_ms: decoyCheck,
      auth_login_ms: authLogin,
    }
  }, null, 2));
}

run().catch((e) => {
  console.error(JSON.stringify({ error: e.message }, null, 2));
  process.exit(1);
});
