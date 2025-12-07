// background.js
import { GitHubAPI } from './github-api.js';

async function loadConfig() {
  try {
    const url = chrome.runtime.getURL('config.json');
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    return await res.json();
  } catch (e) {
    console.warn('⚠️ loadConfig failed:', e.message);
    return {
      githubToken: 'undefined',
      githubUser: 'netadix',
      githubRepo: 'claude_summary',
      githubBranch: 'main'
    };
  }
}

let cachedAPI = null;

async function getAPI() {
  if (!cachedAPI) {
    const config = await loadConfig();
    cachedAPI = new GitHubAPI(config);
  }
  return cachedAPI;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const api = await getAPI();
      
      if (message.action === 'doMemorySave') {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || !tabs[0]) throw new Error('no active tab');
        
        const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'getConversation' });
        if (!response || !response.success) throw new Error(response?.error || 'failed');
        
        await api.saveMemory(response.data, response.sessionId);
        sendResponse({ success: true });
        
      } else if (message.action === 'doSummarySave') {
        const summary = message.summary || '';
        if (!summary) throw new Error('no summary');
        
        await api.saveSummary(summary);
        sendResponse({ success: true });
      }
    } catch (e) {
      console.error('background error', e);
      sendResponse({ success: false, error: e.message });
    }
  })();
  return true;
});