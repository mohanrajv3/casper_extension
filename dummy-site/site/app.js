const form = document.getElementById('loginForm');
const result = document.getElementById('result');
const registerForm = document.getElementById('registerForm');
const registerResult = document.getElementById('registerResult');
const serviceInput = document.getElementById('service');
const regServiceInput = document.getElementById('regService');
const hostService = window.location.hostname || '127.0.0.1';

if (serviceInput) serviceInput.value = hostService;
if (regServiceInput) regServiceInput.value = hostService;

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
