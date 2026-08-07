// Chat Archive Helper - Production Content Script
(function () {
  if (window.__MCE_INITIALIZED__) return;
  window.__MCE_INITIALIZED__ = true;

  console.log('[Chat Archive Helper] Content script active.');

  let isExtracting = false;
  let isPaused = false;
  let scrollContainer = null;
  let capturedMessagesMap = new Map();
  let scrollTimer = null;
  let idleCount = 0;
  let conversationTitle = 'Chat Conversation';

  // Shadow DOM Host & HUD elements
  let hudHost = null;
  let hudShadow = null;
  let hudOverlay = null;

  function initHUD() {
    if (document.getElementById('mce-hud-root')) {
      hudHost = document.getElementById('mce-hud-root');
      hudOverlay = hudShadow.querySelector('#mce-hud-overlay');
      return;
    }

    hudHost = document.createElement('div');
    hudHost.id = 'mce-hud-root';
    hudShadow = hudHost.attachShadow({ mode: 'open' });

    // Inject Shadow CSS
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #mce-hud-overlay {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        width: 320px;
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 16px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(0, 132, 255, 0.2);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #f8fafc;
        padding: 16px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        opacity: 0;
        transform: translateY(-10px) scale(0.98);
        pointer-events: none;
      }
      #mce-hud-overlay.mce-visible {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      .mce-hud-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .mce-hud-title {
        display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px;
        background: linear-gradient(135deg, #0084ff, #a855f7);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      }
      .mce-hud-badge {
        font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 20px;
        background: rgba(0, 132, 255, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);
      }
      .mce-hud-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
      .mce-stat-card {
        background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px; padding: 8px 10px; text-align: center;
      }
      .mce-stat-val { font-size: 18px; font-weight: 700; color: #38bdf8; }
      .mce-stat-label { font-size: 11px; color: #94a3b8; margin-top: 2px; }
      .mce-hud-controls { display: flex; gap: 8px; }
      .mce-btn {
        flex: 1; padding: 8px 12px; border-radius: 8px; border: none; font-size: 12px; font-weight: 600;
        cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s ease;
      }
      .mce-btn-secondary { background: rgba(255, 255, 255, 0.1); color: #f1f5f9; border: 1px solid rgba(255, 255, 255, 0.15); }
      .mce-btn-danger { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); }
      .mce-status-text { font-size: 11px; color: #a1a1aa; text-align: center; margin-top: 8px; }
    `;
    hudShadow.appendChild(styleEl);

    hudOverlay = document.createElement('div');
    hudOverlay.id = 'mce-hud-overlay';
    hudOverlay.innerHTML = `
      <div class="mce-hud-header">
        <div class="mce-hud-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          Chat Archive Helper
        </div>
        <span class="mce-hud-badge" id="mce-hud-status-badge">READY</span>
      </div>

      <div class="mce-hud-stats">
        <div class="mce-stat-card">
          <div class="mce-stat-val" id="mce-count-msg">0</div>
          <div class="mce-stat-label">Messages</div>
        </div>
        <div class="mce-stat-card">
          <div class="mce-stat-val" id="mce-count-img">0</div>
          <div class="mce-stat-label">Photos & Media</div>
        </div>
      </div>

      <div class="mce-hud-controls">
        <button class="mce-btn mce-btn-secondary" id="mce-btn-pause">Pause</button>
        <button class="mce-btn mce-btn-danger" id="mce-btn-stop">Finish & Export</button>
      </div>

      <div class="mce-status-text" id="mce-status-text">Click "Start Auto-Scroll" in popup to begin</div>
    `;

    hudShadow.appendChild(hudOverlay);
    document.body.appendChild(hudHost);

    hudShadow.querySelector('#mce-btn-pause').addEventListener('click', togglePause);
    hudShadow.querySelector('#mce-btn-stop').addEventListener('click', stopExtraction);
  }

  function showHUD() {
    initHUD();
    hudOverlay.classList.add('mce-visible');
  }

  function updateHUD(statusMsg, badgeText = 'SCROLLING') {
    if (!hudOverlay) return;
    hudShadow.querySelector('#mce-count-msg').innerText = capturedMessagesMap.size;
    
    let totalImages = 0;
    capturedMessagesMap.forEach(msg => {
      totalImages += (msg.images ? msg.images.length : 0);
    });
    hudShadow.querySelector('#mce-count-img').innerText = totalImages;

    if (statusMsg) {
      hudShadow.querySelector('#mce-status-text').innerText = statusMsg;
    }
    if (badgeText) {
      hudShadow.querySelector('#mce-hud-status-badge').innerText = badgeText;
    }

    chrome.runtime.sendMessage({
      type: 'MCE_STATUS_UPDATE',
      data: {
        isExtracting,
        isPaused,
        msgCount: capturedMessagesMap.size,
        imgCount: totalImages,
        statusMsg,
        conversationTitle
      }
    }).catch(() => {});
  }

  function getMainChatElement() {
    return document.querySelector('div[aria-label*="Messages in conversation"]') ||
           document.querySelector('div[aria-label*="Tin nhắn trong cuộc trò chuyện"]') ||
           document.querySelector('div[role="main"]') ||
           document.querySelector('[data-pagelet="Messages"]');
  }

  function findScrollContainer() {
    const mainElem = getMainChatElement();
    const root = mainElem || document.body;

    const scrollables = root.querySelectorAll('div');
    let bestDiv = null;
    let maxScrollHeight = 0;

    for (let div of scrollables) {
      if (div.closest('[role="navigation"]') || 
          div.closest('[aria-label*="Chats"]') || 
          div.closest('[aria-label*="Cuộc trò chuyện"]') ||
          div.closest('[aria-label*="Thread information"]') ||
          div.closest('[aria-label*="Thông tin về cuộc trò chuyện"]')) {
        continue;
      }

      const style = window.getComputedStyle(div);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && div.scrollHeight > div.clientHeight) {
        if (div.scrollHeight > maxScrollHeight) {
          maxScrollHeight = div.scrollHeight;
          bestDiv = div;
        }
      }
    }

    return bestDiv || mainElem || document.documentElement;
  }

  function detectConversationTitle() {
    const mainElem = getMainChatElement();
    if (mainElem) {
      const titleHeader = mainElem.querySelector('h1, h2, [role="header"]');
      if (titleHeader && titleHeader.innerText) {
        const txt = titleHeader.innerText.trim();
        if (txt && !txt.includes('Messenger') && !txt.includes('Chats')) {
          return txt;
        }
      }
    }
    return document.title.replace(' | Facebook', '').replace('Messenger', '').trim() || 'Messenger Chat';
  }

  function extractCurrentDOMMessages() {
    conversationTitle = detectConversationTitle();
    const container = scrollContainer || getMainChatElement() || document.body;

    const rowElements = container.querySelectorAll('div[role="row"], div[aria-label*="Message"], div[aria-label*="Tin nhắn"]');

    rowElements.forEach((row) => {
      if (row.closest('[role="navigation"]') || 
          row.closest('[aria-label*="Chats"]') || 
          row.closest('[aria-label*="Cuộc trò chuyện"]') ||
          row.closest('[aria-label*="Thread information"]')) {
        return;
      }

      const textNode = row.querySelector('div[dir="auto"]') || row.querySelector('span[dir="auto"]');
      const text = textNode ? textNode.innerText.trim() : '';

      if (!textNode && row.innerText && row.innerText.length > 300) {
        return;
      }

      const images = [];
      row.querySelectorAll('img').forEach(img => {
        const src = img.src;
        if (src && !src.includes('rsrc.php') && !src.includes('emoji.php') && !src.includes('static.xx.fbcdn.net/rsrc')) {
          const w = img.naturalWidth || img.width || 100;
          const h = img.naturalHeight || img.height || 100;
          if ((w > 40 && h > 40) || src.includes('scontent') || src.includes('fbcdn.net/v/')) {
            images.push({
              src: getHighResImageSrc(img),
              alt: img.alt || 'Photo Attachment',
              width: w,
              height: h
            });
          }
        }
      });

      const videos = [];
      row.querySelectorAll('video').forEach(v => {
        if (v.src) videos.push(v.src);
      });

      const stickers = [];
      row.querySelectorAll('img[src*="sticker"]').forEach(s => {
        if (s.src) stickers.push(s.src);
      });

      let timestamp = '';
      const timeElem = row.querySelector('span[title], div[title], time, [data-scope="date_time"]');
      if (timeElem) {
        timestamp = timeElem.getAttribute('title') || timeElem.innerText;
      }

      // Multi-language Outgoing Detection
      let sender = 'Other';
      const ariaLabel = (row.getAttribute('aria-label') || '').toLowerCase();
      const isOutgoing = ariaLabel.includes('you sent') ||
                         ariaLabel.includes('bạn đã gửi') ||
                         ariaLabel.includes('tu as envoyé') ||
                         ariaLabel.includes('enviaste') ||
                         window.getComputedStyle(row).justifyContent === 'flex-end' ||
                         row.querySelector('[aria-label*="You sent"], [aria-label*="Bạn đã gửi"]');
      
      if (isOutgoing) {
        sender = 'You';
      } else {
        const senderElem = row.querySelector('h2, span[aria-hidden="false"]');
        if (senderElem && senderElem.innerText) {
          sender = senderElem.innerText.trim();
        }
      }

      if (text || images.length > 0 || videos.length > 0 || stickers.length > 0) {
        // Robust Hash Deduping
        const imgHash = images.map(i => i.src.split('?')[0]).join('|');
        const msgHash = `${sender}_${text.length}_${text.slice(0, 50)}_${timestamp}_${imgHash}`;
        
        if (!capturedMessagesMap.has(msgHash)) {
          capturedMessagesMap.set(msgHash, {
            id: 'msg_' + Math.random().toString(36).substr(2, 9),
            sender,
            text,
            timestamp: timestamp || new Date().toLocaleTimeString(),
            images,
            videos,
            stickers,
            isOutgoing: sender === 'You'
          });
        }
      }
    });
  }

  function getHighResImageSrc(img) {
    const parentLink = img.closest('a');
    if (parentLink && parentLink.href && parentLink.href.includes('fbcdn.net')) {
      return parentLink.href;
    }
    return img.src;
  }

  function scrollStep() {
    if (!isExtracting || isPaused) return;

    scrollContainer = findScrollContainer();
    const prevMsgCount = capturedMessagesMap.size;

    extractCurrentDOMMessages();

    const newMsgCount = capturedMessagesMap.size;

    if (scrollContainer && scrollContainer !== document.documentElement) {
      scrollContainer.scrollTop = 0;
      scrollContainer.scrollBy({ top: -300, behavior: 'smooth' });
    }

    if (newMsgCount === prevMsgCount) {
      idleCount++;
      updateHUD(`Loading history... (Attempt ${idleCount}/6)`, 'LOADING');
      if (idleCount >= 6) {
        stopExtraction();
        updateHUD('Reached top of chat history!', 'FINISHED');
        return;
      }
    } else {
      idleCount = 0;
      updateHUD(`Extracted ${capturedMessagesMap.size} messages...`, 'SCROLLING');
    }

    scrollTimer = setTimeout(scrollStep, 1800);
  }

  function startExtraction() {
    if (isExtracting) return;
    isExtracting = true;
    isPaused = false;
    idleCount = 0;
    showHUD();
    updateHUD('Started auto-scroll...', 'SCROLLING');
    scrollStep();
  }

  function togglePause() {
    if (!isExtracting) return;
    isPaused = !isPaused;
    const btn = hudShadow.querySelector('#mce-btn-pause');
    if (isPaused) {
      if (scrollTimer) clearTimeout(scrollTimer);
      if (btn) btn.innerText = 'Resume';
      updateHUD('Extraction paused', 'PAUSED');
    } else {
      if (btn) btn.innerText = 'Pause';
      updateHUD('Resuming auto-scroll...', 'SCROLLING');
      scrollStep();
    }
  }

  function stopExtraction() {
    isExtracting = false;
    isPaused = false;
    if (scrollTimer) clearTimeout(scrollTimer);

    extractCurrentDOMMessages();
    updateHUD('Completed capture. Preparing export...', 'EXPORTING');

    const messages = Array.from(capturedMessagesMap.values());

    chrome.runtime.sendMessage({
      type: 'MCE_EXTRACTION_COMPLETE',
      data: {
        title: conversationTitle,
        messages: messages,
        exportedAt: new Date().toISOString()
      }
    });

    setTimeout(() => {
      updateHUD('Export ready! Check downloads.', 'DONE');
    }, 1200);
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'MCE_START') {
      startExtraction();
      sendResponse({ status: 'STARTED' });
    } else if (request.type === 'MCE_PAUSE') {
      togglePause();
      sendResponse({ status: 'TOGGLED' });
    } else if (request.type === 'MCE_STOP') {
      stopExtraction();
      sendResponse({ status: 'STOPPED' });
    } else if (request.type === 'MCE_GET_STATUS') {
      let totalImages = 0;
      capturedMessagesMap.forEach(msg => {
        totalImages += (msg.images ? msg.images.length : 0);
      });
      sendResponse({
        isExtracting,
        isPaused,
        msgCount: capturedMessagesMap.size,
        imgCount: totalImages,
        conversationTitle: detectConversationTitle()
      });
    }
    return true;
  });

})();
