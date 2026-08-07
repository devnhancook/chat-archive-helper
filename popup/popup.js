document.addEventListener('DOMContentLoaded', async () => {
  const tabTitleEl = document.getElementById('tab-title');
  const tabUrlEl = document.getElementById('tab-url');
  const pulseDotEl = document.getElementById('pulse-dot');
  
  const statMessagesEl = document.getElementById('stat-messages');
  const statPhotosEl = document.getElementById('stat-photos');
  
  const formatSelectEl = document.getElementById('export-format');
  const toggleEmbedEl = document.getElementById('toggle-embed');
  
  const btnStart = document.getElementById('btn-start');
  const dualControls = document.getElementById('button-group-dual') || document.getElementById('dual-controls');
  const btnPause = document.getElementById('btn-pause');
  const btnExport = document.getElementById('btn-export');
  const statusFooter = document.getElementById('status-footer');

  let activeTab = null;

  // Get active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    activeTab = tabs[0];
    tabTitleEl.innerText = activeTab.title || 'Messenger';
    tabUrlEl.innerText = activeTab.url || '';

    const isMessenger = activeTab.url.includes('messenger.com') || activeTab.url.includes('facebook.com/messages');
    if (!isMessenger) {
      pulseDotEl.classList.add('offline');
      statusFooter.innerText = '⚠️ Please open messenger.com or facebook.com/messages first!';
      btnStart.disabled = true;
      btnStart.style.opacity = '0.5';
    } else {
      pulseDotEl.classList.remove('offline');
      // Ping content script
      chrome.tabs.sendMessage(activeTab.id, { type: 'MCE_GET_STATUS' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          statusFooter.innerText = 'Ready. Click Start to begin auto-scroll.';
        } else {
          updateUIState(response);
        }
      });
    }
  }

  function updateUIState(state) {
    statMessagesEl.innerText = state.msgCount || 0;
    statPhotosEl.innerText = state.imgCount || 0;

    if (state.isExtracting) {
      btnStart.style.display = 'none';
      dualControls.style.display = 'flex';
      btnPause.innerText = state.isPaused ? 'Resume' : 'Pause';
      statusFooter.innerText = state.isPaused ? 'Paused. Click Resume or Export Now.' : 'Auto-scrolling and capturing messages...';
    } else {
      btnStart.style.display = 'flex';
      dualControls.style.display = 'none';
      if (state.msgCount > 0) {
        statusFooter.innerText = `Captured ${state.msgCount} messages. Click Start to resume or Export.`;
      }
    }
  }

  // Update background config on change
  function updateConfig() {
    chrome.runtime.sendMessage({
      type: 'MCE_SET_CONFIG',
      data: {
        format: formatSelectEl.value,
        embedImages: toggleEmbedEl.checked
      }
    });
  }

  formatSelectEl.addEventListener('change', updateConfig);
  toggleEmbedEl.addEventListener('change', updateConfig);
  updateConfig(); // initial

  btnStart.addEventListener('click', () => {
    if (!activeTab) return;
    chrome.tabs.sendMessage(activeTab.id, { type: 'MCE_START' }, (response) => {
      if (chrome.runtime.lastError) {
        // Script might not be injected, attempt injection
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['content/content.js']
        }, () => {
          chrome.scripting.insertCSS({
            target: { tabId: activeTab.id },
            files: ['content/content.css']
          }, () => {
            chrome.tabs.sendMessage(activeTab.id, { type: 'MCE_START' });
          });
        });
      }
    });
    btnStart.style.display = 'none';
    dualControls.style.display = 'flex';
    statusFooter.innerText = 'Starting auto-scroll...';
  });

  btnPause.addEventListener('click', () => {
    if (!activeTab) return;
    chrome.tabs.sendMessage(activeTab.id, { type: 'MCE_PAUSE' }, (res) => {
      if (res) {
        btnPause.innerText = btnPause.innerText === 'Pause' ? 'Resume' : 'Pause';
      }
    });
  });

  btnExport.addEventListener('click', () => {
    if (!activeTab) return;
    chrome.tabs.sendMessage(activeTab.id, { type: 'MCE_STOP' });
    statusFooter.innerText = 'Generating export file...';
  });

  // Listen for broadcast status updates
  chrome.runtime.onMessage.addListener((request) => {
    if (request.type === 'MCE_STATUS_UPDATE') {
      updateUIState(request.data);
    }
  });
});
