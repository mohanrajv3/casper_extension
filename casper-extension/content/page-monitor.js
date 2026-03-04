class CasperPageMonitor {
  constructor() {
    this.init();
  }

  init() {
    if (!navigator.credentials) return;

    this.patchCreate();
    this.patchGet();
  }

  patchCreate() {
    if (typeof navigator.credentials.create !== 'function') return;
    const original = navigator.credentials.create.bind(navigator.credentials);

    navigator.credentials.create = async (options) => {
      const result = await original(options);
      if (options?.publicKey && result?.id) {
        this.sendMessage({
          type: 'SECURITY_EVENT',
          event: {
            type: 'webauthn_create',
            url: window.location.href,
            credentialId: result.id,
            timestamp: Date.now(),
          },
        }).catch(() => {});
      }
      return result;
    };
  }

  patchGet() {
    if (typeof navigator.credentials.get !== 'function') return;
    const original = navigator.credentials.get.bind(navigator.credentials);

    navigator.credentials.get = async (options) => {
      const result = await original(options);
      if (options?.publicKey && result?.id) {
        this.sendMessage({
          type: 'SECURITY_EVENT',
          event: {
            type: 'webauthn_get',
            url: window.location.href,
            credentialId: result.id,
            timestamp: Date.now(),
          },
        }).catch(() => {});
      }
      return result;
    };
  }

  sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || {});
      });
    });
  }
}

new CasperPageMonitor();
