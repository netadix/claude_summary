// === トリガーワード（定数） ===
const MEMORY_TRIGGER = '記憶保存お願いします';
const SUMMARY_TRIGGER = 'サマリー保存お願いします';

// === 二重実行防止フラグ ===
let isProcessing = false;

// === プロンプト欄監視・キーワード一致で background に指示 ===
function setupPromptMonitor() {
  function findPromptBox() {
    const byTestId = document.querySelector('textarea[data-testid="chat-input-ssr"]');
    if (byTestId) return byTestId;
    const byAria = document.querySelector('textarea[aria-label], [contenteditable][aria-label]');
    if (byAria) return byAria;
    return document.querySelector('textarea, [contenteditable="true"]');
  }
  
  setInterval(() => {
    // 処理中はスキップ
    if (isProcessing) return;
    
    let promptBox = document.activeElement;
    if (!promptBox || !(promptBox.tagName === 'TEXTAREA' || promptBox.isContentEditable || promptBox.tagName === 'INPUT')) {
      promptBox = findPromptBox();
    }
    if (!promptBox) return;

    let value = '';
    try {
      if (promptBox.tagName === 'TEXTAREA' || promptBox.tagName === 'INPUT') {
        value = promptBox.value || promptBox.getAttribute('value') || '';
      } else if (promptBox.isContentEditable) {
        value = promptBox.textContent || '';
      }
    } catch (e) {
      value = '';
    }

    if (value && /^あ{3,}/.test(value)) {
      const nearby = promptBox.querySelector && promptBox.querySelector('[contenteditable]');
      if (nearby && nearby.textContent && nearby.textContent.trim()) {
        value = nearby.textContent.trim();
      } else if (document.activeElement && document.activeElement !== promptBox) {
        const ae = document.activeElement;
        if (ae.isContentEditable) value = ae.textContent.trim();
        else if (ae.value) value = ae.value.trim();
      }
    }

    value = (value || '').trim();

    function clearAndDispatch(el) {
      try {
        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
          const nativeSetter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
          if (nativeSetter) nativeSetter.call(el, '');
          else el.value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (el.isContentEditable) {
          el.textContent = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch (e) {
        console.warn('clearAndDispatch エラー', e);
        try { el.value = ''; } catch (e2) {}
      }
    }

    if (value === MEMORY_TRIGGER) {
      isProcessing = true;
      console.log('💾 記憶保存開始...');
      clearAndDispatch(promptBox);
      
      chrome.runtime.sendMessage({ action: 'doMemorySave' }, (response) => {
        console.log('✅ Memory save response:', response);
        setTimeout(() => { isProcessing = false; }, 2000);
      });
      
    } else if (value === SUMMARY_TRIGGER) {
      isProcessing = true;
      console.log('📝 サマリー保存開始...');
      const summaryText = value;
      clearAndDispatch(promptBox);
      
      chrome.runtime.sendMessage({ action: 'doSummarySave', summary: summaryText }, (response) => {
        console.log('✅ Summary save response:', response);
        setTimeout(() => { isProcessing = false; }, 2000);
      });
    }
  }, 400);
}
setupPromptMonitor();

function extractConversation() {
  const messages = [];
  const messageContainers = document.querySelectorAll('[data-test-render-count]');
  
  messageContainers.forEach((container) => {
    const textContent = container.innerText || container.textContent || '';
    const trimmed = textContent.trim();
    if (trimmed) messages.push(trimmed);
  });
  
  if (messages.length === 0) {
    throw new Error('会話内容が取得できませんでした');
  }
  
  const now = new Date();
  const title = `# ${now.toLocaleString('ja-JP')} の会話\n\n`;
  return title + messages.join('\n\n---\n\n');
}

function getSessionId() {
  const pathname = window.location.pathname;
  const chatMatch = pathname.match(/\/chat\/([a-zA-Z0-9-]+)/);
  if (chatMatch) return chatMatch[1];
  return `session_${Date.now()}`;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getConversation') {
    try {
      const conversation = extractConversation();
      const sessionId = getSessionId();
      sendResponse({ 
        success: true, 
        data: conversation,
        sessionId: sessionId
      });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true;
});