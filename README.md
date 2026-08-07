# Chat Archive Helper for Web

> **An open-source, privacy-first Chrome Extension for archiving your personal Facebook Messenger conversations with high-res photos and media.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen.svg)](manifest.json)
[![100% Local](https://img.shields.io/badge/Privacy-100%25%20Local-purple.svg)](PRIVACY.md)

---

## 🌟 Key Features

- **🌐 Offline Interactive HTML Viewer**: Export chats into a single, self-contained `.html` file with Base64 embedded photos, instant full-text search, photo lightbox, and dark/light mode toggle.
- **📦 Full ZIP Package**: Download complete archives including `index.html`, `chat.json`, and original high-res image files saved locally in an `images/` folder.
- **📄 Structured JSON & Text Export**: Raw JSON data export for developers or plain text transcripts for printing.
- **🛡️ 100% Privacy Preserved**: Operates **entirely inside your local browser**. Zero analytics, zero external tracking, zero server uploads.
- **🎨 Shadow DOM Encapsulation**: Isolated HUD overlay that prevents host page CSS conflicts.

---

## 🚀 Installation Guide (Developer / Load Unpacked)

Since this project is open-source and intended for community use, you can load it directly into any Chromium browser (Google Chrome, Microsoft Edge, Brave, Opera):

1. **Clone or Download Repository**:
   ```bash
   git clone https://github.com/your-username/chat-archive-helper.git
   ```
   Or download the `.zip` archive and extract it to a local folder.

2. **Open Extensions Page**:
   - Chrome: Navigate to `chrome://extensions`
   - Edge: Navigate to `edge://extensions`
   - Brave: Navigate to `brave://extensions`

3. **Enable Developer Mode**:
   - Toggle the **Developer mode** switch in the top-right corner.

4. **Load Extension**:
   - Click **Load unpacked** (top-left).
   - Select the folder containing `manifest.json`.

---

## 📖 How to Use

1. Open [Messenger Web](https://www.messenger.com) or [Facebook Messages](https://www.facebook.com/messages).
2. Open the active conversation you wish to archive.
3. Click the **Chat Archive Helper** icon in your browser extension toolbar.
4. Choose your desired export format (e.g. *Offline HTML* or *ZIP Archive*).
5. Click **Start Auto-Scroll & Capture**.
6. Watch the live HUD counter load your chat history.
7. Click **Finish & Export Now** to download your archive!

---

## 🔒 Privacy & Safety

Please read our [PRIVACY.md](PRIVACY.md) and [DISCLAIMER.md](DISCLAIMER.md). This tool is built solely to empower users to back up their own personal data under personal data ownership principles.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
