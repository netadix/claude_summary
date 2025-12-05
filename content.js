// === トリガーワード（定数） ===
const MEMORY_TRIGGER = '記憶保存お願いします';
const SUMMARY_TRIGGER = 'サマリー保存お願いします';

// === プロンプト欄監視・キーワード一致で popup に指示 ===
function setupPromptMonitor() {
  function findPromptBox() {
    const byTestId = document.querySelector('textarea[data-testid="chat-input-ssr"]');
    if (byTestId) return byTestId;
    const byAria = document.querySelector('textarea[aria-label], [contenteditable][aria-label]');
    if (byAria) return byAria;
    return document.querySelector('textarea, [contenteditable="true"]');
  }
  setInterval(() => {
    // まずはユーザーがフォーカスしている要素（より信頼できる）を確認
    let promptBox = document.activeElement;
    // フォーカス要素が適切でない場合は通常の探索にフォールバック
    if (!promptBox || !(promptBox.tagName === 'TEXTAREA' || promptBox.isContentEditable || promptBox.tagName === 'INPUT')) {
      promptBox = findPromptBox();
    }
    if (!promptBox) return;

    // 値の読み取り（フォーカス要素優先）
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

    // もしまだ初期SSRのまま（例: ああああ... のようなプレースホルダ）が返ってきている場合、
    // フォーカス中の子要素や近傍の要素に実際の入力があるか探す
    if (value && /^あ{3,}/.test(value)) {
      // 探索: フォーカス要素の直下・兄弟要素で contenteditable のテキストを探す
      const nearby = promptBox.querySelector && promptBox.querySelector('[contenteditable]');
      if (nearby && nearby.textContent && nearby.textContent.trim()) {
        value = nearby.textContent.trim();
      } else if (document.activeElement && document.activeElement !== promptBox) {
        const ae = document.activeElement;
        if (ae.isContentEditable) value = ae.textContent.trim();
        else if (ae.value) value = ae.value.trim();
      }
    }

    console.log('Prompt監視 tag:', promptBox.tagName, 'value:', value);
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
      clearAndDispatch(promptBox);
      chrome.runtime.sendMessage({ action: 'doMemorySave' }, (response) => {
        console.log('Memory save response:', response);
      });
    } else if (value === SUMMARY_TRIGGER) {
      // send the typed summary text to background so it can save even when popup is closed
      const summaryText = value;
      clearAndDispatch(promptBox);
      chrome.runtime.sendMessage({ action: 'doSummarySave', summary: summaryText }, (response) => {
        console.log('Summary save response:', response);
      });
    }
  }, 400);
}
setupPromptMonitor();

function extractConversation() {
  const messages = [];
  
  const messageContainers = document.querySelectorAll('[data-test-render-count]');
  
  messageContainers.forEach((container, index) => {
    const textContent = container.innerText || container.textContent || '';
    const trimmed = textContent.trim();
    
    if (trimmed) {
      messages.push(trimmed);
    }
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
  
  if (chatMatch) {
    return chatMatch[1];
  }
  
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