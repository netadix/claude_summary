// background.js (service worker)
// Handles save requests from content scripts even when popup is closed.

// Try to load CONFIG from config.js (if present in extension) or fallback to default.
async function loadConfig() {
  try {
    const url = chrome.runtime.getURL('config.js');
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    const txt = await res.text();
    console.log('📄 config.js fetched, length:', txt.length);
    // extract object literal assigned to CONFIG or window.CONFIG
    const m = txt.match(/(?:const\s+CONFIG|window\.CONFIG)\s*=\s*(\{[\s\S]*?\});/);
    if (m && m[1]) {
      console.log('🔍 CONFIG found in config.js');
      // evaluate safely the object literal
      // eslint-disable-next-line no-new-func
      const obj = Function('return (' + m[1] + ')')();
      return obj;
    } else {
      console.warn('⚠️ CONFIG pattern not found in config.js');
    }
  } catch (e) {
    console.warn('⚠️ loadConfig from file failed:', e.message);
  }
  
  // Fallback: hardcoded default (same as popup.js for now)
  console.log('📌 Using fallback default CONFIG');
  return {
    githubToken: 'undefined',
    githubUser: 'netadix',
    githubRepo: 'claude_summary',
    githubBranch: 'main'
  };
}

class GitHubAPI {
  constructor(config) {
    this.token = config.githubToken;
    this.user = config.githubUser;
    this.repo = config.githubRepo;
    this.branch = config.githubBranch;
    this.baseUrl = `https://api.github.com/repos/${this.user}/${this.repo}`;
  }

  async saveFile(path, content, message) {
    try {
      let sha = null;
      try {
        const existing = await fetch(`${this.baseUrl}/contents/${path}`, {
          headers: { 'Authorization': `token ${this.token}` }
        });
        if (existing.ok) {
          const data = await existing.json();
          sha = data.sha;
        }
      } catch (e) {
        // ignore
      }

      const response = await fetch(`${this.baseUrl}/contents/${path}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          content: btoa(unescape(encodeURIComponent(content))),
          branch: this.branch,
          ...(sha && { sha })
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'GitHub API error');
      }

      return await response.json();
    } catch (err) {
      console.error('GitHub API error:', err);
      throw err;
    }
  }

  async saveMemory(content, sessionId) {
    // トークン削除
    const sanitizedContent = content.replace(/ghp_[a-zA-Z0-9]{36}/g, '[TOKEN_REMOVED]');
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    // sessionId を引数から取得
    const chatId = sessionId || 'unknown';
    
    const filename = `${year}-${month}-${day}_${chatId}.md`;
    const folderPath = `memories/${year}-${month}`;
    const filePath = `${folderPath}/${filename}`;
    
    console.log(`📂 保存先: ${filePath}`);
    console.log(`🆔 セッションID: ${chatId}`);
    
    try {
      // 古いファイル削除
      await this.deleteOldSessionFiles(folderPath, chatId, filename);
      
      // 新しいファイル保存
      return await this.saveFile(
        filePath,
        sanitizedContent,
        `💾 記憶保存: ${year}-${month}-${day}`
      );
    } catch (error) {
      console.error('保存エラー:', error);
      throw error;
    }
  }

  async deleteOldSessionFiles(folderPath, chatId, currentFilename) {
    try {
      // フォルダ内のファイル一覧取得
      const response = await fetch(`${this.baseUrl}/contents/${folderPath}`, {
        headers: { 'Authorization': `token ${this.token}` }
      });
      
      if (!response.ok) {
        // フォルダが存在しない場合は何もしない
        return;
      }
      
      const files = await response.json();
      
      // 同じセッションIDのファイルを探す
      const oldFiles = files.filter(file => {
        return file.name.endsWith(`_${chatId}.md`) && 
              file.name !== currentFilename;
      });
      
      // 古いファイルを削除
      for (const file of oldFiles) {
        console.log(`🗑️ 古いファイル削除: ${file.name}`);
        await fetch(`${this.baseUrl}/contents/${folderPath}/${file.name}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `token ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `🗑️ 古いセッションファイル削除: ${file.name}`,
            sha: file.sha,
            branch: this.branch
          })
        });
      }
    } catch (error) {
      console.warn('古いファイル削除時のエラー(無視):', error);
      // エラーが出ても保存は続行
    }
  }

  async saveSummary(content) {
    return await this.saveFile(
      'summary.md',
      content,
      '📝 サマリー更新'
    );
  }
}

let GITHUB_API = null;

async function ensureApi() {
  if (GITHUB_API) return GITHUB_API;
  const cfg = await loadConfig();
  console.log('🔑 Loaded CONFIG:', { 
    githubToken: cfg.githubToken && cfg.githubToken !== 'REPLACE_WITH_GITHUB_TOKEN' ? '***' + cfg.githubToken.slice(-8) : 'MISSING/PLACEHOLDER',
    githubUser: cfg.githubUser,
    githubRepo: cfg.githubRepo
  });
  GITHUB_API = new GitHubAPI(cfg);
  return GITHUB_API;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const api = await ensureApi();
      if (message.action === 'doMemorySave') {
        // get conversation from the active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || !tabs[0]) throw new Error('no active tab');
        const tab = tabs[0];
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getConversation' });
        if (!response || !response.success) throw new Error(response?.error || 'failed to get conversation');
        await api.saveMemory(response.data, response.sessionId);
        sendResponse({ success: true });
      } else if (message.action === 'doSummarySave') {
        const summary = message.summary || '';
        if (!summary) throw new Error('no summary provided');
        await api.saveSummary(summary);
        sendResponse({ success: true });
      }
    } catch (e) {
      console.error('background handler error', e);
      try { sendResponse({ success: false, error: e.message }); } catch (e2) {}
    }
  })();
  return true;
});
