// Chat Archive Helper - Production Content Script (Zero HUD / Clean Extension Controlled)
(function () {
  if (window.__MCE_INITIALIZED__) return;
  window.__MCE_INITIALIZED__ = true;

  console.log('[Chat Archive Helper] Content script initialized without in-page HUD.');

  let isExtracting = false;
  let isPaused = false;
  let scrollContainer = null;
  let scrollTimer = null;
  let idleCount = 0;
  let scrollSpeedMode = 'turbo'; // 'turbo' | 'fast' | 'normal'
  let conversationTitle = 'Messenger Chat';

  // Master chronological storage (Strictly: index 0 = Oldest, index N-1 = Newest)
  let capturedMessages = [];
  let capturedSignatures = new Set();
  let domObserver = null;
  let lastKnownIncomingSender = 'Friend';
  let maxMessageLimit = 0;
  let lastCheckpointSaved = 0;
  let lastCooldownMilestone = 0;

  function broadcastStatus(statusMsg = '') {
    let totalImages = 0;
    capturedMessages.forEach(msg => {
      totalImages += (msg.images ? msg.images.length : 0);
    });

    const state = {
      isExtracting,
      isPaused,
      msgCount: capturedMessages.length,
      imgCount: totalImages,
      statusMsg,
      conversationTitle: detectConversationTitle()
    };

    // Save to storage for persistent popup reopen
    chrome.storage.local.set({ mceCurrentState: state });

    // Checkpoint auto-save every 200 messages to prevent data loss
    if (capturedMessages.length >= lastCheckpointSaved + 200) {
      lastCheckpointSaved = capturedMessages.length;
      chrome.storage.local.set({
        mceCheckpointBackup: {
          title: conversationTitle,
          messages: capturedMessages,
          savedAt: new Date().toISOString()
        }
      });
    }

    // Broadcast live to popup if open
    chrome.runtime.sendMessage({
      type: 'MCE_STATUS_UPDATE',
      data: state
    }).catch(() => {});
  }

  function detectConversationTitle() {
    const mainElem = getMainChatElement();
    if (mainElem) {
      const titleHeader = mainElem.querySelector('h1, h2, [role="header"]');
      if (titleHeader && titleHeader.innerText) {
        const txt = titleHeader.innerText.trim();
        if (txt && !txt.includes('Messenger') && !txt.includes('Chats') && !txt.includes('Cuộc trò chuyện')) {
          return txt;
        }
      }
    }
    const docTitle = document.title.replace(' | Facebook', '').replace('Messenger', '').trim();
    return docTitle || 'Messenger Chat';
  }

  function getMainChatElement() {
    return document.querySelector('div[role="grid"]') ||
           document.querySelector('div[aria-label*="Messages in conversation"]') ||
           document.querySelector('div[aria-label*="Tin nhắn trong cuộc trò chuyện"]') ||
           document.querySelector('div[role="main"]') ||
           document.querySelector('[data-pagelet="Messages"]') ||
           document.body;
  }

  function findScrollContainer() {
    // 1. Try finding scrollable parent of role="grid" or message list
    const specificContainer = document.querySelector('div[role="grid"]') ||
                              document.querySelector('div[aria-label*="Messages in conversation"]') ||
                              document.querySelector('div[aria-label*="Tin nhắn trong cuộc trò chuyện"]');
    
    if (specificContainer) {
      let current = specificContainer;
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
          return current;
        }
        current = current.parentElement;
      }
    }

    // 2. Scan all scrollables on page (exclude navigation / thread info sidebars)
    const allDivs = document.querySelectorAll('div');
    let bestDiv = null;
    let maxScrollHeight = 0;

    for (let div of allDivs) {
      if (div.closest('[role="navigation"]') || 
          div.closest('[aria-label*="Chats"]') || 
          div.closest('[aria-label*="Cuộc trò chuyện"]') ||
          div.closest('[aria-label*="Thread information"]')) {
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

    return bestDiv || document.querySelector('div[role="main"]') || document.documentElement;
  }

  function getHighResImageSrc(img) {
    // Check srcset first for highest resolution image
    if (img.srcset) {
      const candidates = img.srcset.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        return parts[0];
      }).filter(Boolean);
      if (candidates.length > 0) {
        return candidates[candidates.length - 1];
      }
    }

    // Check parent anchor for direct photo view
    const parentLink = img.closest('a');
    if (parentLink && parentLink.href && parentLink.href.includes('fbcdn.net')) {
      return parentLink.href;
    }

    return img.currentSrc || img.src;
  }

  function isInsideAvatarContainer(el) {
    if (!el || typeof el.closest !== 'function') return false;

    // Check explicit avatar containers
    const avatarWrapper = el.closest(
      '[data-scope="author_avatar"], [aria-label*="profile" i], [aria-label*="Profile"], [aria-label*="ảnh đại diện" i], [aria-label*="avatar" i], [data-hovercard*="user"], [data-hovercard*="profile"]'
    );
    if (avatarWrapper) return true;

    // Check if inside a profile anchor (not a photo viewer)
    const anchor = el.closest('a');
    if (anchor && anchor.href) {
      const href = anchor.href.toLowerCase();
      if ((href.includes('facebook.com/') || href.includes('messenger.com/')) &&
          !href.includes('photo') && !href.includes('media') && !href.includes('fbcdn.net')) {
        return true;
      }
    }

    // Check if any nearby ancestor has circular 50% border radius and small avatar size
    let p = el.parentElement;
    for (let depth = 0; depth < 3 && p && p !== document.body; depth++) {
      try {
        const cs = window.getComputedStyle(p);
        if (cs.borderRadius === '50%' || cs.borderRadius.includes('50%')) {
          const pw = p.offsetWidth || parseFloat(cs.width) || 0;
          if (pw > 0 && pw <= 60) return true;
        }
      } catch (e) {}
      p = p.parentElement;
    }

    return false;
  }

  function isAvatarOrIcon(el, customSrc = '', sender = '') {
    const src = customSrc || el.src || '';
    if (!src) return true;

    // 1. Static UI icons & standard emojis
    if (src.includes('rsrc.php') || src.includes('emoji.php') || src.includes('static.xx.fbcdn.net/rsrc') || src.includes('/assets/')) {
      return true;
    }

    // 2. Facebook CDN Profile Picture / Avatar URL signatures:
    // - Type -1 indicator (e.g. t39.30808-1, t1.30497-1, t1.18169-1) denotes user/page avatar
    // - Standard square avatar resolutions: /p50x50/, /p60x60/, /p100x100/, /s100x100/, /p160x160/, /s160x160/, /p200x200/, /s200x200/, /p320x320/
    // - Parameter stp=c0.5000 (square avatar crop) or dst-jpg_s100x100 / dst-jpg_p100x100 / dst-jpg_s50x50
    if (
      /\/t\d+\.\d+-1[\/_.]/.test(src) ||
      /\/v\/t[0-9.]+-1\//.test(src) ||
      /\/(?:p|s)(?:50|60|100|160|200|320)x\1\//.test(src) ||
      /stp=c0\.\d+/.test(src) ||
      /dst-jpg_[sp](?:50|60|100|160|200)x\1/.test(src)
    ) {
      return true;
    }

    // 3. Parent container check
    if (isInsideAvatarContainer(el)) {
      return true;
    }

    // 4. Alt & Aria-label checks
    const alt = (el.alt || (typeof el.getAttribute === 'function' ? el.getAttribute('alt') : '') || '').toLowerCase().trim();
    const ariaLabel = (typeof el.getAttribute === 'function' ? el.getAttribute('aria-label') : '' || '').toLowerCase().trim();
    if (
      alt.includes('profile picture') || alt.includes('ảnh đại diện') || alt.includes('avatar') ||
      ariaLabel.includes('profile picture') || ariaLabel.includes('ảnh đại diện') || ariaLabel.includes('avatar')
    ) {
      return true;
    }

    // Check if alt or aria-label matches sender or conversation title
    if (sender && sender !== 'Other' && sender !== 'You') {
      const senderNorm = sender.toLowerCase().trim();
      if (alt === senderNorm || ariaLabel === senderNorm) {
        return true;
      }
    }
    if (conversationTitle) {
      const titleNorm = conversationTitle.toLowerCase().trim();
      if (alt === titleNorm || ariaLabel === titleNorm) {
        return true;
      }
    }

    // 5. Rendered layout dimensions (Messenger chat avatars are typically 28px - 44px)
    let layoutW = 0, layoutH = 0;
    try {
      if (typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          layoutW = rect.width;
          layoutH = rect.height;
        }
      }
    } catch (e) {}

    if (!layoutW || !layoutH) {
      layoutW = el.offsetWidth || el.clientWidth || 0;
      layoutH = el.offsetHeight || el.clientHeight || 0;
    }

    if (!layoutW || !layoutH) {
      try {
        const cs = window.getComputedStyle(el);
        const pw = parseFloat(cs.width);
        const ph = parseFloat(cs.height);
        if (!isNaN(pw) && pw > 0) layoutW = pw;
        if (!isNaN(ph) && ph > 0) layoutH = ph;
      } catch (e) {}
    }

    // Avatars and badges in chat are <= 52px
    if (layoutW > 0 && layoutH > 0 && layoutW <= 52 && layoutH <= 52) {
      return true;
    }

    // 6. Circular styling check on element
    try {
      const cs = window.getComputedStyle(el);
      const isCircular = cs.borderRadius === '50%' || cs.borderRadius.includes('50%');
      // Sent photos never have circular 50% border radius
      if (isCircular && (layoutW <= 72 || (!layoutW && (el.naturalWidth || 0) <= 200))) {
        return true;
      }
    } catch (e) {}

    return false;
  }

  function extractImagesFromElement(element, sender = '') {
    const images = [];
    const seenSrcs = new Set();

    // 1. Regular <img> elements
    const imgElements = element.querySelectorAll('img');
    imgElements.forEach(img => {
      if (isAvatarOrIcon(img, '', sender)) return;

      const src = img.src || '';
      const isFbCdn = src.includes('fbcdn.net') || 
                      src.includes('scontent') || 
                      src.includes('cdninstagram.com') ||
                      src.startsWith('blob:');

      if (isFbCdn) {
        const highResSrc = getHighResImageSrc(img);
        if (isAvatarOrIcon(img, highResSrc, sender)) return;
        if (seenSrcs.has(highResSrc)) return;
        seenSrcs.add(highResSrc);

        let w = img.naturalWidth || img.width || 0;
        let h = img.naturalHeight || img.height || 0;
        if (!w || !h) {
          try {
            const rect = img.getBoundingClientRect();
            w = rect.width || 200;
            h = rect.height || 200;
          } catch (e) {
            w = 200; h = 200;
          }
        }

        images.push({
          src: highResSrc,
          alt: img.alt || 'Photo Attachment',
          width: w,
          height: h
        });
      }
    });

    // 2. CSS background-image elements (strictly filtered)
    element.querySelectorAll('div[style*="background-image"]').forEach(bgEl => {
      const bgStyle = bgEl.style.backgroundImage || '';
      const match = bgStyle.match(/url\(["']?(https:\/\/[^"']*(?:fbcdn\.net|scontent)[^"']*)["']?\)/i);
      if (match && match[1]) {
        const bgUrl = match[1];
        if (isAvatarOrIcon(bgEl, bgUrl, sender)) return;
        if (seenSrcs.has(bgUrl)) return;
        seenSrcs.add(bgUrl);

        let w = bgEl.offsetWidth || bgEl.clientWidth || 0;
        let h = bgEl.offsetHeight || bgEl.clientHeight || 0;
        if (w <= 52 && h <= 52 && (w > 0 || h > 0)) return;

        images.push({
          src: bgUrl,
          alt: 'Photo Background',
          width: w || 200,
          height: h || 200
        });
      }
    });

    return images;
  }

  function extractCurrentDOMMessages() {
    conversationTitle = detectConversationTitle();
    const container = scrollContainer || getMainChatElement() || document.body;

    // Comprehensive selector covering all message bubble formats in Messenger Comet
    const rowElements = container.querySelectorAll(
      'div[role="row"], div[role="gridcell"], div[aria-label*="Message"], div[aria-label*="Tin nhắn"], div[aria-label*="Photo"], div[aria-label*="Ảnh"], div[data-scope="messages_table"]'
    );

    const frameMessages = [];

    rowElements.forEach((row, rowIndex) => {
      // Exclude left sidebar / thread header navigation
      if (row.closest('[role="navigation"]') || 
          row.closest('[aria-label*="Chats"]') || 
          row.closest('[aria-label*="Cuộc trò chuyện"]') ||
          row.closest('[aria-label*="Thread information"]')) {
        return;
      }

      // Avoid nested row processing if current row is an inner child of another message row
      if (row.parentElement && row.parentElement.closest('div[role="row"]')) {
        return;
      }

      // 1. Sender & Outgoing Detection (evaluated before media extraction)
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
        const senderElem = row.querySelector('h2, h3, h4, span[aria-hidden="false"]');
        if (senderElem && senderElem.innerText && senderElem.innerText.trim().length > 0 && senderElem.innerText.trim().length < 40) {
          sender = senderElem.innerText.trim();
          lastKnownIncomingSender = sender;
        } else {
          sender = lastKnownIncomingSender || conversationTitle || 'Other';
        }
      }

      // 2. Text extraction
      const textNode = row.querySelector('div[dir="auto"]') || row.querySelector('span[dir="auto"]');
      const text = textNode ? textNode.innerText.trim() : '';

      // Skip non-message giant containers
      if (!textNode && row.innerText && row.innerText.length > 500) {
        return;
      }

      // 3. Photos & Media (strictly filtered with sender context)
      const images = extractImagesFromElement(row, sender);

      // 4. Videos
      const videos = [];
      row.querySelectorAll('video').forEach(v => {
        const src = v.src || (v.querySelector('source') ? v.querySelector('source').src : '');
        if (src) videos.push(src);
      });

      // 5. Voice Notes & Audio Clips
      const audios = [];
      row.querySelectorAll('audio').forEach(a => {
        const src = a.src || (a.querySelector('source') ? a.querySelector('source').src : '');
        if (src && !audios.includes(src)) audios.push(src);
      });
      row.querySelectorAll('[aria-label*="voice clip"], [aria-label*="tin nhắn thoại"], [aria-label*="Voice"]').forEach(vEl => {
        const a = vEl.querySelector('audio');
        if (a && a.src && !audios.includes(a.src)) audios.push(a.src);
      });

      // 6. File & Document Attachments
      const files = [];
      row.querySelectorAll('a[href*="attachment"], a[download], a[href*="messages/attachments"]').forEach(a => {
        const fileName = a.innerText.trim() || a.getAttribute('download') || 'Document Attachment';
        if (fileName && a.href && !a.href.startsWith('javascript')) {
          files.push({ name: fileName.slice(0, 100), url: a.href });
        }
      });

      // 7. Stickers
      const stickers = [];
      row.querySelectorAll('img[src*="sticker"]').forEach(s => {
        if (s.src) stickers.push(s.src);
      });

      // 8. Reply Quote Detection
      let replyTo = null;
      const replyBlock = row.querySelector('[aria-label*="replied"], [aria-label*="đã trả lời"], [data-scope="quoted_message"]');
      if (replyBlock) {
        const quoteText = replyBlock.innerText.trim();
        if (quoteText && quoteText !== text) {
          replyTo = { text: quoteText.slice(0, 200) };
        }
      }

      // 9. Timestamp
      let timestamp = '';
      const timeElem = row.querySelector('span[title], div[title], time, [data-scope="date_time"]');
      if (timeElem) {
        timestamp = timeElem.getAttribute('title') || timeElem.innerText.trim();
      }

      // Valid message condition: must contain text OR images OR videos OR audios OR files OR stickers
      if (text || images.length > 0 || videos.length > 0 || audios.length > 0 || files.length > 0 || stickers.length > 0) {
        // Tag DOM element with unique ID to avoid re-extraction in same node
        let elemId = row.__mce_id__;
        if (!elemId) {
          elemId = 'mid_' + Math.random().toString(36).substr(2, 9);
          row.__mce_id__ = elemId;
        }

        const imgHash = images.map(i => i.src.split('?')[0]).join('|');
        const fileHash = files.map(f => f.name).join('|');
        const signature = `${sender}__${text}__${imgHash}__${fileHash}__${timestamp}`;

        frameMessages.push({
          id: elemId,
          signature,
          sender,
          text,
          timestamp: timestamp || new Date().toLocaleTimeString(),
          images,
          videos,
          audios,
          files,
          stickers,
          replyTo,
          isOutgoing: sender === 'You',
          captureTime: Date.now()
        });
      }
    });

    if (frameMessages.length === 0) return;

    // Merge frame messages into capturedMessages in STRICT CHRONOLOGICAL ORDER
    if (capturedMessages.length === 0) {
      // First batch: frame messages are Top (Oldest) to Bottom (Newest)
      frameMessages.forEach(msg => {
        if (!capturedSignatures.has(msg.signature)) {
          capturedSignatures.add(msg.signature);
          capturedMessages.push(msg);
        }
      });
    } else {
      // Subsequent scroll-up batches: older messages appear at top of DOM.
      // Filter out messages that already exist in capturedSignatures.
      const newOlderMessages = [];
      frameMessages.forEach(msg => {
        if (!capturedSignatures.has(msg.signature)) {
          capturedSignatures.add(msg.signature);
          newOlderMessages.push(msg);
        }
      });

      if (newOlderMessages.length > 0) {
        // Prepend older messages so they stay at the TOP (Oldest first)
        capturedMessages = [...newOlderMessages, ...capturedMessages];
      }
    }
  }

  function getScrollInterval() {
    let base = 450;
    if (scrollSpeedMode === 'fast') base = 750;
    else if (scrollSpeedMode === 'normal') base = 1200;

    // Exponential backoff during idle to give Facebook GraphQL time to load deep history
    if (idleCount > 4) {
      base = Math.min(2600, base + (idleCount - 4) * 120);
    }
    // Human Jitter (+/- 80ms)
    const jitter = Math.floor(Math.random() * 160) - 80;
    return Math.max(300, base + jitter);
  }

  function scrollStep() {
    if (!isExtracting || isPaused) return;

    scrollContainer = findScrollContainer();
    const prevCount = capturedMessages.length;

    extractCurrentDOMMessages();
    const newCount = capturedMessages.length;

    // 1. Check phase target limit
    if (maxMessageLimit > 0 && newCount >= maxMessageLimit) {
      if (capturedMessages.length > maxMessageLimit) {
        capturedMessages = capturedMessages.slice(capturedMessages.length - maxMessageLimit);
      }
      broadcastStatus(`Reached phase target of ${maxMessageLimit} messages! Finalizing export...`);
      stopExtraction();
      return;
    }

    // 2. Account protection: 2-second cool-down breath every 500 messages
    let coolDownDelay = 0;
    if (newCount > 0 && newCount >= lastCooldownMilestone + 500) {
      lastCooldownMilestone = newCount;
      coolDownDelay = 2000;
      broadcastStatus(`Milestone ${newCount} msgs: taking 2s cool-down breath to protect account...`);
    }

    // Scroll up
    if (scrollContainer && scrollContainer !== document.documentElement) {
      scrollContainer.scrollTop = 0;
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -1000,
        bubbles: true,
        cancelable: true
      });
      scrollContainer.dispatchEvent(wheelEvent);
      scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
    } else {
      window.scrollTo(0, 0);
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -1000, bubbles: true }));
    }

    if (newCount === prevCount) {
      idleCount++;
      const limitText = maxMessageLimit > 0 ? ` (${newCount}/${maxMessageLimit})` : '';
      broadcastStatus(`Loading older history... (${idleCount}/35)${limitText}`);

      // Adaptive Jiggle Scroll: every 4 idle attempts, jiggle scroll position down then up
      // to trigger Facebook's IntersectionObserver for deep history
      if (idleCount % 4 === 0 && scrollContainer) {
        scrollContainer.scrollTop = 160;
        setTimeout(() => {
          if (scrollContainer) {
            scrollContainer.scrollTop = 0;
            scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -1200, bubbles: true }));
          }
        }, 120);
      }

      if (idleCount >= 35) {
        stopExtraction();
        broadcastStatus('Reached top of chat history! Exporting...');
        return;
      }
    } else {
      idleCount = 0;
      const limitText = maxMessageLimit > 0 ? ` (${capturedMessages.length}/${maxMessageLimit})` : '';
      broadcastStatus(`Capturing: ${capturedMessages.length} messages...${limitText}`);
    }

    scrollTimer = setTimeout(scrollStep, getScrollInterval() + coolDownDelay);
  }

  function startExtraction(speed = 'turbo', limit = 0) {
    if (isExtracting) return;
    scrollSpeedMode = speed || 'turbo';
    maxMessageLimit = parseInt(limit, 10) || 0;
    isExtracting = true;
    isPaused = false;
    idleCount = 0;

    initMutationObserver();
    const limitInfo = maxMessageLimit > 0 ? ` (Target: ${maxMessageLimit} msgs)` : ' (Unlimited)';
    broadcastStatus(`Started auto-scroll (${scrollSpeedMode.toUpperCase()}${limitInfo})...`);
    scrollStep();
  }

  function togglePause() {
    if (!isExtracting) return;
    isPaused = !isPaused;
    if (isPaused) {
      if (scrollTimer) clearTimeout(scrollTimer);
      broadcastStatus('Extraction paused.');
    } else {
      broadcastStatus('Resuming auto-scroll...');
      scrollStep();
    }
  }

  function stopExtraction() {
    isExtracting = false;
    isPaused = false;
    if (scrollTimer) clearTimeout(scrollTimer);
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }

    extractCurrentDOMMessages();
    broadcastStatus('Extraction completed. Finalizing export...');

    // capturedMessages is ALREADY strictly sorted: index 0 = Oldest, index N-1 = Newest!
    // No .reverse() needed!
    chrome.runtime.sendMessage({
      type: 'MCE_EXTRACTION_COMPLETE',
      data: {
        title: conversationTitle,
        messages: capturedMessages,
        exportedAt: new Date().toISOString()
      }
    });

    setTimeout(() => {
      broadcastStatus('Export ready! Check your Downloads folder.');
    }, 1200);
  }

  function initMutationObserver() {
    if (domObserver) return;
    const targetNode = getMainChatElement() || document.body;
    domObserver = new MutationObserver(() => {
      if (isExtracting && !isPaused) {
        extractCurrentDOMMessages();
      }
    });
    domObserver.observe(targetNode, { childList: true, subtree: true });
  }

  // Communication API with Extension Popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'MCE_START') {
      startExtraction(request.speed || 'turbo', request.limit || 0);
      sendResponse({ status: 'STARTED' });
    } else if (request.type === 'MCE_SET_SPEED') {
      scrollSpeedMode = request.speed || 'turbo';
      if (request.limit !== undefined) maxMessageLimit = parseInt(request.limit, 10) || 0;
      broadcastStatus(`Speed set to ${scrollSpeedMode.toUpperCase()}`);
      sendResponse({ status: 'OK' });
    } else if (request.type === 'MCE_PAUSE') {
      togglePause();
      sendResponse({ status: isPaused ? 'PAUSED' : 'RESUMED' });
    } else if (request.type === 'MCE_STOP') {
      stopExtraction();
      sendResponse({ status: 'STOPPED' });
    } else if (request.type === 'MCE_RESET') {
      capturedMessages = [];
      capturedSignatures.clear();
      idleCount = 0;
      broadcastStatus('Session reset. Ready.');
      sendResponse({ status: 'RESET' });
    } else if (request.type === 'MCE_GET_STATUS') {
      let totalImages = 0;
      capturedMessages.forEach(msg => {
        totalImages += (msg.images ? msg.images.length : 0);
      });
      sendResponse({
        isExtracting,
        isPaused,
        msgCount: capturedMessages.length,
        imgCount: totalImages,
        conversationTitle: detectConversationTitle()
      });
    }
    return true;
  });

})();
