# Privacy Policy - Chat Archive Helper

**Last Updated: 2026**

## 1. 100% Local Data Processing
Chat Archive Helper operates **exclusively inside your local web browser**. 

- **No Remote Servers**: This extension does not maintain, connect to, or send data to any remote server or third-party service.
- **No Telemetry / Analytics**: We do not track user usage, IP addresses, browser info, or message statistics.
- **No Third-Party Scripts**: No tracking SDKs, advertising scripts, or remote analytics are included.

## 2. Permissions Explained
- `activeTab` & `scripting`: Required to inject the auto-scroll harvester and HUD overlay on active Messenger/Facebook tabs when invoked by the user.
- `storage`: Used solely to persist your local export preferences (such as selected export format) within your browser (`chrome.storage.local`).
- `downloads`: Required to trigger browser file downloads when saving your exported chat logs (`.html`, `.json`, `.zip`, `.txt`).
- `host_permissions`: Strictly scoped to `https://www.messenger.com/*` and `https://www.facebook.com/*` to allow media conversion.

## 3. Data Ownership
All exported files belong entirely to you and are saved directly to your local computer's download directory.
