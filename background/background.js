// Background Service Worker for Chat Archive Helper
importScripts('/lib/jszip.min.js', '/viewer/viewer_template.js');

console.log('[Chat Archive Helper] Background service worker initialized.');

let currentExportConfig = {
  format: 'html', // 'html' | 'zip' | 'json' | 'txt'
  embedImages: true
};

let capturedDataStore = null;

// Initialize config from storage
chrome.storage.local.get(['exportConfig', 'lastCapturedData'], (res) => {
  if (res.exportConfig) currentExportConfig = res.exportConfig;
  if (res.lastCapturedData) capturedDataStore = res.lastCapturedData;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'MCE_SET_CONFIG') {
    currentExportConfig = { ...currentExportConfig, ...request.data };
    chrome.storage.local.set({ exportConfig: currentExportConfig });
    sendResponse({ status: 'OK' });
  } else if (request.type === 'MCE_EXTRACTION_COMPLETE') {
    capturedDataStore = request.data;
    chrome.storage.local.set({ lastCapturedData: request.data });
    handleExport(request.data, currentExportConfig);
    sendResponse({ status: 'EXPORTING' });
  } else if (request.type === 'MCE_DIRECT_EXPORT') {
    if (capturedDataStore) {
      handleExport(capturedDataStore, request.config || currentExportConfig);
      sendResponse({ status: 'EXPORTING' });
    } else {
      sendResponse({ status: 'NO_DATA' });
    }
  }
  return true;
});

async function handleExport(data, config) {
  const sanitizeTitle = (data.title || 'Chat_Archive').replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestampStr = new Date().toISOString().slice(0, 10);
  const baseFilename = `Archive_${sanitizeTitle}_${timestampStr}`;

  console.log(`[Export] Starting export for ${data.messages.length} messages. Format: ${config.format}`);

  try {
    if (config.format === 'json') {
      exportJSON(data, `${baseFilename}.json`);
    } else if (config.format === 'txt') {
      exportTXT(data, `${baseFilename}.txt`);
    } else if (config.format === 'html') {
      await exportHTML(data, `${baseFilename}.html`, config.embedImages);
    } else if (config.format === 'zip') {
      await exportZIP(data, `${baseFilename}.zip`);
    }
  } catch (err) {
    console.error('[Export Error]', err);
  }
}

async function convertURLToBase64(url, timeoutMs = 8000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn(`[Base64 Conversion Failed] ${url}:`, err.message);
    return url; // Fallback to original URL
  }
}

async function processMessageImages(messages, concurrency = 8) {
  // Collect all unique image URLs to download concurrently
  const uniqueUrls = new Set();
  messages.forEach(msg => {
    if (msg.images && msg.images.length > 0) {
      msg.images.forEach(img => {
        if (img.src) uniqueUrls.add(img.src);
      });
    }
  });

  const urlArray = Array.from(uniqueUrls);
  const cacheMap = new Map();

  // Process in concurrent batches
  for (let i = 0; i < urlArray.length; i += concurrency) {
    const batch = urlArray.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(url => convertURLToBase64(url, 8000)));
    batch.forEach((url, idx) => {
      cacheMap.set(url, results[idx]);
    });
  }

  // Map cached base64 data back to messages
  return messages.map(msg => {
    const copyMsg = { ...msg, images: [] };
    if (msg.images && msg.images.length > 0) {
      copyMsg.images = msg.images.map(img => ({
        ...img,
        dataUrl: cacheMap.get(img.src) || img.src
      }));
    }
    return copyMsg;
  });
}

async function exportHTML(data, filename, embedImages = true) {
  let messagesToExport = data.messages;
  if (embedImages) {
    messagesToExport = await processMessageImages(data.messages);
  }

  const htmlContent = generateOfflineHTML({
    title: data.title,
    messages: messagesToExport,
    exportedAt: data.exportedAt
  });

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const reader = new FileReader();
  reader.onloadend = () => {
    chrome.downloads.download({
      url: reader.result,
      filename: filename,
      saveAs: true
    });
  };
  reader.readAsDataURL(blob);
}

function exportJSON(data, filename) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const reader = new FileReader();
  reader.onloadend = () => {
    chrome.downloads.download({
      url: reader.result,
      filename: filename,
      saveAs: true
    });
  };
  reader.readAsDataURL(blob);
}

function exportTXT(data, filename) {
  let txtContent = `Chat Archive: ${data.title}\nExported At: ${data.exportedAt}\nTotal Messages: ${data.messages.length}\n${'='.repeat(60)}\n\n`;

  data.messages.forEach(msg => {
    if (msg.replyTo && msg.replyTo.text) {
      txtContent += `   ↪ Replying to: "${msg.replyTo.text}"\n`;
    }
    txtContent += `[${msg.timestamp}] ${msg.sender}: ${msg.text}\n`;
    if (msg.images && msg.images.length > 0) {
      msg.images.forEach(img => {
        txtContent += `   [Image Attachment: ${img.src}]\n`;
      });
    }
    if (msg.audios && msg.audios.length > 0) {
      msg.audios.forEach(aud => {
        txtContent += `   [Audio Clip: ${aud}]\n`;
      });
    }
    if (msg.files && msg.files.length > 0) {
      msg.files.forEach(f => {
        txtContent += `   [File Attachment: ${f.name} -> ${f.url}]\n`;
      });
    }
    txtContent += `\n`;
  });

  const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
  const reader = new FileReader();
  reader.onloadend = () => {
    chrome.downloads.download({
      url: reader.result,
      filename: filename,
      saveAs: true
    });
  };
  reader.readAsDataURL(blob);
}

async function exportZIP(data, filename, concurrency = 8) {
  const zip = new JSZip();
  const imgFolder = zip.folder('images');

  // Collect unique images
  const uniqueImgMap = new Map();
  let imgCount = 1;
  data.messages.forEach(msg => {
    if (msg.images && msg.images.length > 0) {
      msg.images.forEach(img => {
        if (img.src && !uniqueImgMap.has(img.src)) {
          uniqueImgMap.set(img.src, {
            originalSrc: img.src,
            localPath: `images/img_${imgCount++}`
          });
        }
      });
    }
  });

  const uniqueList = Array.from(uniqueImgMap.values());

  // Concurrent download batches
  for (let i = 0; i < uniqueList.length; i += concurrency) {
    const batch = uniqueList.slice(i, i + concurrency);
    await Promise.all(batch.map(async (item) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(item.originalSrc, { signal: controller.signal });
        clearTimeout(timer);

        if (response.ok) {
          const blob = await response.blob();
          const ext = blob.type.split('/')[1] || 'jpg';
          const filename = `${item.localPath}.${ext}`.replace('images/', '');
          item.finalRelativePath = `images/${filename}`;
          imgFolder.file(filename, blob);
        }
      } catch (e) {
        item.finalRelativePath = item.originalSrc;
      }
    }));
  }

  // Remap processed messages
  const processedMessages = data.messages.map(msg => {
    const copyMsg = { ...msg, images: [] };
    if (msg.images && msg.images.length > 0) {
      copyMsg.images = msg.images.map(img => {
        const cached = uniqueImgMap.get(img.src);
        return {
          ...img,
          src: cached && cached.finalRelativePath ? cached.finalRelativePath : img.src
        };
      });
    }
    return copyMsg;
  });

  const zipData = { ...data, messages: processedMessages };
  zip.file('chat.json', JSON.stringify(zipData, null, 2));

  const htmlContent = generateOfflineHTML({
    title: data.title,
    messages: processedMessages,
    exportedAt: data.exportedAt
  });
  zip.file('index.html', htmlContent);

  const base64Zip = await zip.generateAsync({ type: 'base64' });
  const dataUrl = 'data:application/zip;base64,' + base64Zip;

  chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: true
  });
}
