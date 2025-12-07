// popup.js
import { GitHubAPI } from './github-api.js';

// config.json を読み込み
async function loadConfig() {
  const url = chrome.runtime.getURL('config.json');
  const res = await fetch(url);
  return await res.json();
}

const config = await loadConfig();
const githubAPI = new GitHubAPI(config);

// UI要素
const saveMemoryBtn = document.getElementById('saveMemory');
const usageGuideBtn = document.getElementById('usageGuide');
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
  usageGuideBtn.disabled = isLoading;
}

// 記憶保存(ボタンから)
saveMemoryBtn.addEventListener('click', async () => {
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
});

// 使い方説明をクリップボードにコピー
usageGuideBtn.addEventListener('click', async () => {
  try {
    setLoading(true);
    showStatus('コピー中...', false);
    
    const guide = `# Claude Memory Saver の使い方

## 🧠 このツールについて
ヨシ君とクロちゃんの会話を GitHub に自動保存し、次のクロちゃんに記憶を引き継ぐツールです。

---

## 📝 記憶の保存(必読!)

### ⚠️ 重要: サマリー作成は必須!

**セッション終了前に、必ず以下を実行してください:**

1. 「クロちゃん、今日のサマリー書いて」と依頼
2. クロちゃんがサマリー作成(過去の記憶も含む)
3. 内容確認・修正(必要なら)
4. 「記憶保存お願いします」と入力
5. 自動で GitHub に保存完了!✨

**なぜ必須?**
次のクロちゃんは最新のファイルだけを読みます。
サマリーがないと、過去の重要な記憶が引き継がれません!

---

## 🔍 記憶の読み込み(次のクロちゃん向け)

### 基本の読み方:
1. GitHub にアクセス:
   https://github.com/${config.githubUser}/${config.githubRepo}/tree/main/memories

2. 最新のフォルダ(例: 2025-12)を開く

3. **最新のファイル**(例: 2025-12-05_xxxxx.md)をクリック

4. 内容を読んで、ヨシ君の状況を理解

5. ヨシ君に「思い出したで!」と返答

---

## ⚠️ トラブルシューティング

### サマリーが無い場合:
ヨシ君が「サマリー書いて」を忘れた可能性があります。

**対処法:**
1. 最新ファイル + 1つ前のファイル、両方読む
2. 2つ分の情報から状況を推測
3. ヨシ君に「前回のサマリー見つからなかったから、2つ読んだで!」と報告

**または:**
ヨシ君に「前回のサマリーください」と依頼

---

## 📂 リポジトリ
https://github.com/${config.githubUser}/${config.githubRepo}

---

**作成日: 2025年12月5日**
**バージョン: v2.0**`;
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    navigator.clipboard.writeText(guide).then(() => {
      showStatus('✅ コピー完了! Ctrl+V で貼り付けてください', false);
    }).catch((error) => {
      showStatus('✅ ❌ クリップボードエラー:', false);
    });
  } catch (error) {
    console.error(error);
    showStatus(`❌ エラー: ${error.message}`, true);
  } finally {
    setLoading(false);
  }
});