const form = document.getElementById('loginForm');
const result = document.getElementById('result');
const registerForm = document.getElementById('registerForm');
const registerResult = document.getElementById('registerResult');
const serviceInput = document.getElementById('service');
const regServiceInput = document.getElementById('regService');
const hostService = 'dummy-auth.local';
const passkeyStoreKey = 'fitnest_passkeys_v1';

if (window.location.hostname === '0.0.0.0' || window.location.hostname === '127.0.0.1') {
  const url = new URL(window.location.href);
  url.hostname = 'localhost';
  window.location.replace(url.toString());
}

if (serviceInput) serviceInput.value = hostService;
if (regServiceInput) regServiceInput.value = hostService;

function randomBytes(len = 32) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
}

function toBase64Url(uint8) {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(uint8)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input) {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function loadPasskeys() {
  try {
    const raw = localStorage.getItem(passkeyStoreKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function savePasskeys(store) {
  localStorage.setItem(passkeyStoreKey, JSON.stringify(store || {}));
}

async function createPasskey(identifier) {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error('Passkeys not supported in this browser');
  }
  const clean = normalizeIdentifier(identifier);
  if (!clean) throw new Error('Identifier is required');
  const challenge = randomBytes(32);
  const userId = randomBytes(16);
  const rpId = window.location.hostname === 'localhost' ? 'localhost' : undefined;
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: rpId ? { name: 'FitNest Demo', id: rpId } : { name: 'FitNest Demo' },
      user: {
        id: userId,
        name: clean,
        displayName: clean,
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
      },
    },
  });
  if (!credential?.rawId) throw new Error('Passkey creation failed');

  const store = loadPasskeys();
  const list = Array.isArray(store[clean]) ? store[clean] : [];
  const credentialId = toBase64Url(credential.rawId);
  if (!list.includes(credentialId)) list.push(credentialId);
  store[clean] = list;
  savePasskeys(store);
  return credentialId;
}

async function loginWithPasskey(identifier) {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error('Passkeys not supported in this browser');
  }
  const clean = normalizeIdentifier(identifier);
  if (!clean) throw new Error('Identifier is required');

  const store = loadPasskeys();
  const list = Array.isArray(store[clean]) ? store[clean] : [];
  if (!list.length) throw new Error('No passkey registered for this identifier');

  const challenge = randomBytes(32);
  const rpId = window.location.hostname === 'localhost' ? 'localhost' : undefined;
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: list.map((id) => ({
        type: 'public-key',
        id: fromBase64Url(id),
      })),
      ...(rpId ? { rpId } : {}),
      userVerification: 'required',
      timeout: 60000,
    },
  });
  if (!assertion?.rawId) throw new Error('Passkey login failed');
  return toBase64Url(assertion.rawId);
}

if (form && result) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    result.textContent = 'Checking...';

    const payload = {
      service_name: (serviceInput?.value || hostService).trim(),
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value,
    };

    try {
      const resp = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.success) {
        result.textContent = 'Login success';
        result.className = 'result ok';
        window.dispatchEvent(new CustomEvent('casper-auth-success', { detail: { ...payload, action: 'login' } }));
        sessionStorage.setItem('fitnest_user', payload.username);
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 350);
      } else {
        result.textContent = data.message || 'Login failed';
        result.className = 'result err';
        window.dispatchEvent(new CustomEvent('casper-auth-failure', {
          detail: {
            ...payload,
            action: 'login',
            reason: data.message || 'invalid_credentials',
          },
        }));
      }
    } catch (error) {
      result.textContent = `Request failed: ${error.message}`;
      result.className = 'result err';
    }
  });
}

if (registerForm && registerResult) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerResult.textContent = 'Creating account...';

    const payload = {
      service_name: (regServiceInput?.value || hostService).trim(),
      username: document.getElementById('regUsername').value.trim(),
      password: document.getElementById('regPassword').value,
    };

    try {
      const resp = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.success) {
        registerResult.textContent = 'Account created. CASPER should prompt to save after submit.';
        registerResult.className = 'result ok';
        window.dispatchEvent(new CustomEvent('casper-auth-success', { detail: { ...payload, action: 'register' } }));
        setTimeout(() => {
          window.location.href = '/login';
        }, 500);
      } else {
        registerResult.textContent = data.message || 'Registration failed';
        registerResult.className = 'result err';
        window.dispatchEvent(new CustomEvent('casper-auth-failure', {
          detail: {
            ...payload,
            action: 'register',
            reason: data.message || 'registration_failed',
          },
        }));
      }
    } catch (error) {
      registerResult.textContent = `Request failed: ${error.message}`;
      registerResult.className = 'result err';
    }
  });
}

const sessionUser = document.getElementById('sessionUser');
if (sessionUser) {
  const user = sessionStorage.getItem('fitnest_user') || 'Guest';
  sessionUser.textContent = `Signed in as: ${user}`;
}

const createPasskeyBtn = document.getElementById('createPasskeyBtn');
const passkeyRegisterIdentifier = document.getElementById('passkeyRegisterIdentifier');
const passkeyRegisterResult = document.getElementById('passkeyRegisterResult');

if (createPasskeyBtn && passkeyRegisterIdentifier && passkeyRegisterResult) {
  createPasskeyBtn.addEventListener('click', async () => {
    passkeyRegisterResult.textContent = 'Creating passkey...';
    passkeyRegisterResult.className = 'result';
    try {
      const userIdentifier = passkeyRegisterIdentifier.value;
      const credentialId = await createPasskey(userIdentifier);
      passkeyRegisterResult.textContent = 'Passkey created successfully.';
      passkeyRegisterResult.className = 'result ok';
      window.dispatchEvent(
        new CustomEvent('casper-passkey-register-success', {
          detail: {
            service_name: hostService,
            userIdentifier: normalizeIdentifier(userIdentifier),
            credentialId,
          },
        })
      );
    } catch (error) {
      passkeyRegisterResult.textContent = error.message || 'Passkey creation failed';
      passkeyRegisterResult.className = 'result err';
    }
  });
}

const loginWithPasskeyBtn = document.getElementById('loginWithPasskeyBtn');
const registerPasskeyFromLoginBtn = document.getElementById('registerPasskeyFromLoginBtn');
const passkeyLoginIdentifier = document.getElementById('passkeyLoginIdentifier');
const passkeyLoginResult = document.getElementById('passkeyLoginResult');

if (loginWithPasskeyBtn && passkeyLoginIdentifier && passkeyLoginResult) {
  if (registerPasskeyFromLoginBtn) {
    registerPasskeyFromLoginBtn.addEventListener('click', async () => {
      passkeyLoginResult.textContent = 'Registering passkey...';
      passkeyLoginResult.className = 'result';
      try {
        const userIdentifier = passkeyLoginIdentifier.value;
        const credentialId = await createPasskey(userIdentifier);
        passkeyLoginResult.textContent = 'Passkey registered. You can now sign in with passkey.';
        passkeyLoginResult.className = 'result ok';
        window.dispatchEvent(
          new CustomEvent('casper-passkey-register-success', {
            detail: {
              service_name: hostService,
              userIdentifier: normalizeIdentifier(userIdentifier),
              credentialId,
            },
          })
        );
      } catch (error) {
        passkeyLoginResult.textContent = error.message || 'Passkey registration failed';
        passkeyLoginResult.className = 'result err';
      }
    });
  }

  loginWithPasskeyBtn.addEventListener('click', async () => {
    passkeyLoginResult.textContent = 'Checking passkey...';
    passkeyLoginResult.className = 'result';
    try {
      const userIdentifier = passkeyLoginIdentifier.value;
      const credentialId = await loginWithPasskey(userIdentifier);
      const normalizedUser = normalizeIdentifier(userIdentifier);
      passkeyLoginResult.textContent = 'Passkey login success';
      passkeyLoginResult.className = 'result ok';
      sessionStorage.setItem('fitnest_user', normalizedUser);
      window.dispatchEvent(
        new CustomEvent('casper-passkey-login-success', {
          detail: {
            service_name: hostService,
            userIdentifier: normalizedUser,
            credentialId,
          },
        })
      );
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 350);
    } catch (error) {
      passkeyLoginResult.textContent = error.message || 'Passkey login failed';
      passkeyLoginResult.className = 'result err';
      window.dispatchEvent(
        new CustomEvent('casper-auth-failure', {
          detail: {
            service_name: hostService,
            username: normalizeIdentifier(passkeyLoginIdentifier.value),
            reason: 'passkey_auth_failed',
          },
        })
      );
    }
  });
}
