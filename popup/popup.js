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
  let statusPollTimer = null;

  // Restore cached state from storage immediately
  chrome.storage.local.get(['mceCurrentState'], (res) => {
    if (res && res.mceCurrentState) {
      updateUIState(res.mceCurrentState);
    }
  });

  // Get active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    activeTab = tabs[0];
    tabTitleEl.innerText = activeTab.title || 'Messenger';
    tabUrlEl.innerText = activeTab.url || '';

    const isMessenger = activeTab.url && (activeTab.url.includes('messenger.com') || activeTab.url.includes('facebook.com/messages'));
    if (!isMessenger) {
      pulseDotEl.classList.add('offline');
      statusFooter.innerText = '⚠️ Please open messenger.com or facebook.com/messages first!';
      btnStart.disabled = true;
      btnStart.style.opacity = '0.5';
    } else {
      pulseDotEl.classList.remove('offline');
      pollStatus();
      // Regular polling while popup is open
      statusPollTimer = setInterval(pollStatus, 750);
    }
  }

  function pollStatus() {
    if (!activeTab) return;
    chrome.tabs.sendMessage(activeTab.id, { type: 'MCE_GET_STATUS' }, (response) => {
      if (!chrome.runtime.lastError && response) {
        updateUIState(response);
      }
    });
  }

  function updateUIState(state) {
    if (!state) return;
    statMessagesEl.innerText = state.msgCount || 0;
    statPhotosEl.innerText = state.imgCount || 0;

    if (state.isExtracting) {
      btnStart.style.display = 'none';
      dualControls.style.display = 'flex';
      btnPause.innerText = state.isPaused ? 'Resume' : 'Pause';
      statusFooter.innerText = state.statusMsg || (state.isPaused ? 'Paused. Click Resume or Export Now.' : 'Auto-scrolling and capturing messages...');
    } else {
      btnStart.style.display = 'flex';
      dualControls.style.display = 'none';
      if (state.statusMsg) {
        statusFooter.innerText = state.statusMsg;
      } else if (state.msgCount > 0) {
        statusFooter.innerText = `Captured ${state.msgCount} messages. Click Start to resume or Export.`;
      }
    }
  }

  // Update background config on change
  const scrollSpeedEl = document.getElementById('scroll-speed');
  const messageLimitEl = document.getElementById('message-limit');

  function updateConfig() {
    chrome.runtime.sendMessage({
      type: 'MCE_SET_CONFIG',
      data: {
        format: formatSelectEl.value,
        embedImages: toggleEmbedEl.checked,
        limit: messageLimitEl ? parseInt(messageLimitEl.value, 10) : 0
      }
    });

    if (activeTab) {
      chrome.tabs.sendMessage(activeTab.id, {
        type: 'MCE_SET_SPEED',
        speed: scrollSpeedEl ? scrollSpeedEl.value : 'turbo',
        limit: messageLimitEl ? parseInt(messageLimitEl.value, 10) : 0
      }).catch(() => {});
    }
  }

  if (scrollSpeedEl) scrollSpeedEl.addEventListener('change', updateConfig);
  if (messageLimitEl) messageLimitEl.addEventListener('change', updateConfig);
  formatSelectEl.addEventListener('change', updateConfig);
  toggleEmbedEl.addEventListener('change', updateConfig);
  updateConfig(); // initial

  btnStart.addEventListener('click', () => {
    if (!activeTab) return;
    const currentSpeed = scrollSpeedEl ? scrollSpeedEl.value : 'turbo';
    const currentLimit = messageLimitEl ? parseInt(messageLimitEl.value, 10) : 0;
    chrome.tabs.sendMessage(activeTab.id, { type: 'MCE_START', speed: currentSpeed, limit: currentLimit }, (response) => {
      if (chrome.runtime.lastError) {
        // Script might not be injected, inject content script
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['content/content.js']
        }, () => {
          chrome.tabs.sendMessage(activeTab.id, { type: 'MCE_START', speed: currentSpeed, limit: currentLimit });
        });
      }
    });
    btnStart.style.display = 'none';
    dualControls.style.display = 'flex';
    statusFooter.innerText = `Starting ${currentSpeed.toUpperCase()} auto-scroll...`;
  });

  btnPause.addEventListener('click', () => {
    if (!activeTab) return;
    chrome.tabs.sendMessage(activeTab.id, { type: 'MCE_PAUSE' }, (res) => {
      if (res) {
        btnPause.innerText = res.status === 'PAUSED' ? 'Resume' : 'Pause';
      }
    });
  });

  btnExport.addEventListener('click', () => {
    if (!activeTab) return;
    chrome.tabs.sendMessage(activeTab.id, { type: 'MCE_STOP' });
    statusFooter.innerText = 'Finalizing and exporting archive... Check downloads!';
  });

  const btnReset = document.getElementById('btn-reset');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (!activeTab) return;
      chrome.tabs.sendMessage(activeTab.id, { type: 'MCE_RESET' }, () => {
        statMessagesEl.innerText = '0';
        statPhotosEl.innerText = '0';
        statusFooter.innerText = 'Session reset. Ready for new capture.';
        chrome.storage.local.remove(['mceCurrentState']);
      });
    });
  }

  // Listen for broadcast status updates
  chrome.runtime.onMessage.addListener((request) => {
    if (request.type === 'MCE_STATUS_UPDATE') {
      updateUIState(request.data);
    }
  });

  window.addEventListener('unload', () => {
    if (statusPollTimer) clearInterval(statusPollTimer);
  });
});
