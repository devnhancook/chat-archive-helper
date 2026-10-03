// Viewer Template Generator for Chat Archive Helper (Production Ready & XSS Safe)
function generateOfflineHTML(data) {
  const { title, messages, exportedAt } = data;

  // Safe JSON serialization escaping HTML tag delimiters to prevent script injection
  const jsonSerialized = JSON.stringify(messages)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(title)} - Chat Archive Viewer</title>
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-card: rgba(30, 41, 59, 0.7);
      --bg-msg-in: #1e293b;
      --bg-msg-out: linear-gradient(135deg, #0084ff, #0066cc);
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --border-color: rgba(255, 255, 255, 0.1);
      --accent: #0084ff;
    }

    [data-theme="light"] {
      --bg-primary: #f1f5f9;
      --bg-card: #ffffff;
      --bg-msg-in: #e2e8f0;
      --bg-msg-out: linear-gradient(135deg, #0084ff, #0066cc);
      --text-primary: #0f172a;
      --text-secondary: #64748b;
      --border-color: rgba(0, 0, 0, 0.1);
      --accent: #0084ff;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    header {
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .header-info h1 {
      font-size: 20px;
      font-weight: 700;
    }

    .header-info p {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .search-input {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 8px 14px;
      border-radius: 20px;
      outline: none;
      font-size: 13px;
      width: 220px;
      transition: all 0.2s;
    }

    .search-input:focus {
      border-color: var(--accent);
      width: 280px;
    }

    .theme-btn {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 8px 14px;
      border-radius: 20px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }

    main {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      max-width: 900px;
      width: 100%;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .msg-row {
      display: flex;
      flex-direction: column;
      max-width: 75%;
    }

    .msg-row.outgoing {
      align-self: flex-end;
      align-items: flex-end;
    }

    .msg-row.incoming {
      align-self: flex-start;
      align-items: flex-start;
    }

    .msg-sender {
      font-size: 11px;
      color: var(--text-secondary);
      margin-bottom: 2px;
      padding: 0 4px;
    }

    .msg-bubble {
      padding: 10px 14px;
      border-radius: 18px;
      font-size: 14px;
      line-height: 1.4;
      word-break: break-word;
      position: relative;
    }

    .msg-row.incoming .msg-bubble {
      background: var(--bg-msg-in);
      color: var(--text-primary);
      border-bottom-left-radius: 4px;
    }

    .msg-row.outgoing .msg-bubble {
      background: var(--bg-msg-out);
      color: #ffffff;
      border-bottom-right-radius: 4px;
    }

    .msg-media {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }

    .msg-media img {
      max-width: 260px;
      max-height: 260px;
      border-radius: 12px;
      object-fit: cover;
      cursor: pointer;
      transition: transform 0.2s;
    }

    .msg-media img:hover {
      transform: scale(1.03);
    }

    .msg-reply-box {
      font-size: 11px;
      color: var(--text-secondary);
      background: rgba(255, 255, 255, 0.05);
      border-left: 3px solid var(--accent);
      padding: 4px 8px;
      border-radius: 4px;
      margin-bottom: 4px;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .msg-audio {
      margin-top: 6px;
    }

    .msg-audio audio {
      height: 36px;
      border-radius: 20px;
      outline: none;
      max-width: 260px;
    }

    .msg-files {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 6px;
    }

    .file-attach-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--accent);
      font-size: 12px;
      text-decoration: none;
      font-weight: 500;
      transition: all 0.2s;
    }

    .file-attach-btn:hover {
      background: rgba(0, 132, 255, 0.15);
      border-color: var(--accent);
    }

    .msg-time {
      font-size: 10px;
      color: var(--text-secondary);
      margin-top: 3px;
      padding: 0 4px;
    }

    /* Lightbox */
    #lightbox {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.9);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    }

    #lightbox.active {
      display: flex;
    }

    #lightbox img {
      max-width: 90vw;
      max-height: 90vh;
      border-radius: 8px;
    }

    .lightbox-close {
      position: absolute;
      top: 20px;
      right: 20px;
      color: white;
      font-size: 28px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-info">
      <h1 id="view-title">Loading...</h1>
      <p>Exported <span id="exported-time"></span> &bull; <span id="msg-count-header">0</span> messages</p>
    </div>
    <div class="controls">
      <input type="text" id="search-box" class="search-input" placeholder="Search messages...">
      <button class="theme-btn" onclick="toggleTheme()">Toggle Theme</button>
    </div>
  </header>

  <main id="chat-container"></main>

  <div id="lightbox" onclick="closeLightbox()">
    <span class="lightbox-close">&times;</span>
    <img id="lightbox-img" src="" alt="Fullscreen image">
  </div>

  <script>
    const messages = ${jsonSerialized};
    const titleText = ${JSON.stringify(title)};
    const exportedAtText = ${JSON.stringify(exportedAt)};

    document.getElementById('view-title').innerText = titleText;
    document.getElementById('exported-time').innerText = new Date(exportedAtText).toLocaleString();
    document.getElementById('msg-count-header').innerText = messages.length;

    function renderMessages(filterText = '') {
      const container = document.getElementById('chat-container');
      container.innerHTML = '';

      const query = filterText.toLowerCase();

      messages.forEach(msg => {
        if (query && !msg.text.toLowerCase().includes(query) && !msg.sender.toLowerCase().includes(query)) {
          return;
        }

        const row = document.createElement('div');
        row.className = 'msg-row ' + (msg.isOutgoing ? 'outgoing' : 'incoming');

        if (!msg.isOutgoing && msg.sender) {
          const senderDiv = document.createElement('div');
          senderDiv.className = 'msg-sender';
          senderDiv.innerText = msg.sender;
          row.appendChild(senderDiv);
        }

        if (msg.replyTo && msg.replyTo.text) {
          const replyDiv = document.createElement('div');
          replyDiv.className = 'msg-reply-box';
          replyDiv.innerText = '↩ ' + msg.replyTo.text;
          row.appendChild(replyDiv);
        }

        if (msg.text) {
          const bubbleDiv = document.createElement('div');
          bubbleDiv.className = 'msg-bubble';
          bubbleDiv.innerText = msg.text;
          row.appendChild(bubbleDiv);
        }

        if (msg.images && msg.images.length > 0) {
          const mediaDiv = document.createElement('div');
          mediaDiv.className = 'msg-media';
          msg.images.forEach(img => {
            const imgEl = document.createElement('img');
            imgEl.src = img.dataUrl || img.src;
            imgEl.alt = img.alt || 'Photo';
            imgEl.addEventListener('click', (e) => openLightbox(e, img.dataUrl || img.src));
            mediaDiv.appendChild(imgEl);
          });
          row.appendChild(mediaDiv);
        }

        if (msg.audios && msg.audios.length > 0) {
          const audioDiv = document.createElement('div');
          audioDiv.className = 'msg-audio';
          msg.audios.forEach(src => {
            const audioEl = document.createElement('audio');
            audioEl.controls = true;
            audioEl.src = src;
            audioDiv.appendChild(audioEl);
          });
          row.appendChild(audioDiv);
        }

    function isSafeUrl(url) {
      if (!url) return false;
      try {
        const parsed = new URL(url, window.location.href);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'data:';
      } catch (e) {
        return false;
      }
    }

    if (msg.files && msg.files.length > 0) {
      const filesDiv = document.createElement('div');
      filesDiv.className = 'msg-files';
      msg.files.forEach(f => {
        const a = document.createElement('a');
        a.className = 'file-attach-btn';
        a.href = isSafeUrl(f.url) ? f.url : '#';
        a.target = '_blank';
        a.rel = 'noreferrer noopener';
        a.innerText = '📎 ' + f.name;
        filesDiv.appendChild(a);
      });
      row.appendChild(filesDiv);
    }

        if (msg.timestamp) {
          const timeDiv = document.createElement('div');
          timeDiv.className = 'msg-time';
          timeDiv.innerText = msg.timestamp;
          row.appendChild(timeDiv);
        }

        container.appendChild(row);
      });
    }

    function toggleTheme() {
      const body = document.body;
      const current = body.getAttribute('data-theme');
      body.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
    }

    function openLightbox(e, src) {
      e.stopPropagation();
      document.getElementById('lightbox-img').src = src;
      document.getElementById('lightbox').classList.add('active');
    }

    function closeLightbox() {
      document.getElementById('lightbox').classList.remove('active');
    }

    document.getElementById('search-box').addEventListener('input', (e) => {
      renderMessages(e.target.value);
    });

    renderMessages();
  </script>
</body>
</html>`;
}

function escapeHTML(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}
