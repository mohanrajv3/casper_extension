function getApi() {
  if (typeof browser !== 'undefined') return browser;
  if (typeof chrome !== 'undefined') return chrome;
  throw new Error('No browser extension API available');
}

function getStorageArea(api, preferSync = true) {
  if (preferSync && api.storage?.sync) return api.storage.sync;
  if (api.storage?.local) return api.storage.local;
  throw new Error('No storage area available');
}

export class SyncManager {
  constructor() {
    this.api = getApi();
    this.syncKey = 'casperCloudVault';
    this.localKey = 'casperCloudVaultLocal';
  }

  async loadCloudData() {
    const syncStore = getStorageArea(this.api, true);
    const localStore = getStorageArea(this.api, false);

    const syncResult = await syncStore.get([this.syncKey]);
    const localResult = await localStore.get([this.localKey]);

    const syncData = syncResult[this.syncKey] || null;
    const localData = localResult[this.localKey] || null;

    if (!syncData) return localData;
    if (!localData) return syncData;

    const syncUpdated = Number(syncData?.vault?.lastModified || 0);
    const localUpdated = Number(localData?.vault?.lastModified || 0);
    return localUpdated > syncUpdated ? localData : syncData;
  }

  async saveCloudData(payload) {
    const syncStore = getStorageArea(this.api, true);
    const localStore = getStorageArea(this.api, false);

    try {
      await syncStore.set({ [this.syncKey]: payload });
    } catch (error) {
      const message = String(error?.message || error || '');
      const quotaLike =
        message.includes('QUOTA') ||
        message.includes('quota') ||
        message.includes('kQuotaBytesPerItem');
      if (!quotaLike) throw error;
      // Sync quota exceeded. Persist full vault locally to keep runtime functional.
      await localStore.set({ [this.localKey]: payload });
      return true;
    }

    // Keep local mirror for recovery and non-sync browsers.
    await localStore.set({ [this.localKey]: payload });
    return true;
  }

  async loadLocalState() {
    const store = getStorageArea(this.api, false);
    const result = await store.get(['casperLocalState']);
    return result.casperLocalState || {};
  }

  async saveLocalState(state) {
    const store = getStorageArea(this.api, false);
    await store.set({ casperLocalState: state });
  }
}
