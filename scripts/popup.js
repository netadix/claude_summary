// popup.js
// config.jsはpopup.htmlで読み込まれる想定

const githubAPI = new GitHubAPI(CONFIG);

// UI要素
const saveMemoryBtn = document.getElementById('saveMemory');
const saveSummaryBtn = document.getElementById('saveSummary');
const summaryText = document.getElementById('summaryText');
const statusDiv = document.getElementById('status');

// ステータス表示
function showStatus(message, isError = false) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${isError ? 'error' : 'success'}`;
  statusDiv.classList.remove('hidden');
  
  setTimeout(() => {
    statusDiv.classList.add('hidden');
  }, 3000);
}

// ボタン無効化/有効化
function setLoading(isLoading) {
  saveMemoryBtn.disabled = isLoading;
  saveSummaryBtn.disabled = isLoading;
}

// === 記憶保存処理を関数に分離 ===
async function doMemorySave() {
  try {
    setLoading(true);
    showStatus('会話を取得中...', false);
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getConversation' });
    
    if (!response.success) {
      throw new Error(response.error);
    }
    
    showStatus('GitHubに保存中...', false);
    await githubAPI.saveMemory(response.data, response.sessionId);
    
    showStatus('✅ 保存完了!', false);
  } catch (error) {
    console.error(error);
    showStatus(`❌ エラー: ${error.message}`, true);
  } finally {
    setLoading(false);
  }
}

// === サマリー保存処理を関数に分離 ===
async function doSummarySave() {
  const summary = summaryText.value.trim();
  
  if (!summary) {
    showStatus('❌ サマリーを入力してください', true);
    return;
  }
  
  try {
    setLoading(true);
    showStatus('GitHubに保存中...', false);
    
    await githubAPI.saveSummary(summary);
    
    showStatus('✅ サマリー保存完了!', false);
    summaryText.value = ''; // クリア
  } catch (error) {
    console.error(error);
    showStatus(`❌ エラー: ${error.message}`, true);
  } finally {
    setLoading(false);
  }
}

// ボタンクリックイベント（ポップアップから）
saveMemoryBtn.addEventListener('click', doMemorySave);
saveSummaryBtn.addEventListener('click', doSummarySave);

// === content.js からのメッセージリスナー ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'doMemorySave') {
    doMemorySave().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // 非同期レスポンス
  } else if (message.action === 'doSummarySave') {
    doSummarySave().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

