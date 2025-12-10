// 起動時: LocalStorageから読み込み
const lastSummary = localStorage.getItem('lastSummary');
if (lastSummary) {
  document.getElementById('lastSummary').value = lastSummary;
}

// サマリー保存時: LocalStorageにも保存
saveSummaryBtn.addEventListener('click', async () => {
  const summary = summaryText.value.trim();
  
  if (!summary) {
    showStatus('❌ サマリーを入力してください', true);
    return;
  }
  
  try {
    setLoading(true);
    showStatus('GitHubに保存中...', false);
    
    await githubAPI.saveSummaryFile(summary);
    
    // LocalStorageにも保存
    localStorage.setItem('lastSummary', summary);
    
    showStatus('✅ サマリー保存完了!', false);
    summaryText.value = ''; // クリア
  } catch (error) {
    console.error(error);
    showStatus(`❌ エラー: ${error.message}`, true);
  } finally {
    setLoading(false);
  }
});

// コピーボタン
document.getElementById('copySummary').addEventListener('click', () => {
  const lastSummary = document.getElementById('lastSummary').value;
  navigator.clipboard.writeText(lastSummary).then(() => {
    showStatus('✅ コピー完了! 次のクロちゃんに貼り付けてな!', false);
  });
});
```