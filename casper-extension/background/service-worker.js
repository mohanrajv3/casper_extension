import { casperCore } from './casper-core.js';
import { syncManager } from './sync-manager.js';

// Service worker implementation
let currentVault = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log("CASPER Extension installed!");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'UNLOCK_VAULT') {
    // Unlock vault logic
    const success = true; // placeholder
    sendResponse({ success });
  } else if (request.type === 'GET_CREDENTIALS') {
    sendResponse({ credentials: [] });
  } else if (request.type === 'SYNC_VAULT') {
    syncManager.syncToCloud(new Uint8Array(10)).then(res => sendResponse({ success: res }));
    return true; // Keep message channel open for async response
  }
});
