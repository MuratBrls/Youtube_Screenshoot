# 🎬 YouTube Frame Catcher & Metadata Stamper (v1.4)

A lightweight browser extension that captures YouTube video frames at **native resolution** (1080p, 4K, etc.) as lossless TIF or JPG, allows customizing keyboard shortcuts, and saves files directly to a chosen folder.

![Manifest](https://img.shields.io/badge/Manifest-V3-green)
![Compatibility](https://img.shields.io/badge/OS-Windows%20%7C%20macOS-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ Features

- 📷 **One-Click Capture** — Injects a camera button directly into the YouTube player controls.
- ⚙️ **In-Player Settings Panel** — A minimalist settings overlay that opens directly inside the player via a gear (⚙️) icon.
- 📁 **Direct Folder Selection (FSA API)** — Saves directly to your chosen folder on your disk. No more "Save As" prompts or default Downloads clutter.
- ⌨️ **Custom Keyboard Shortcut** — Record and assign any key (default is `P`) to trigger the capture.
- 🖼️ **Format Selection** — Toggle between compressed **JPG** and lossless **TIF** formats right inside the settings panel.
- 🏷️ **Clean File Naming** — No watermark or overlay on the image. Files are auto-named using: `ChannelName_VideoTitle_Minutes-Seconds.jpg`.
- ☁️ **iOS-Style Minimal Notification** — Clean, modern slide-in notification on the top right showing successful captures.

---

## 📁 Project Structure

```
Youtube_Screenshoot/
├── manifest.json       ← Manifest configuration and permissions (Manifest V3)
├── content.js          ← Main script injecting buttons, panel, and capturing canvas
├── background.js       ← Service worker managing downloads API
├── utif.js             ← UTIF.js lossless TIF encoder by Photopea
├── popup.html          ← Browser toolbar popup interface
├── popup.js            ← Popup logic
└── icons/              ← Extension branding assets
```

---

## 🚀 Installation (Windows / macOS)

To load the extension manually:

1. Clone or download this repository to your machine:
   ```bash
   git clone https://github.com/MuratBrls/Youtube_Screenshoot.git
   ```
2. Open your browser (Chrome or Edge) and navigate to `chrome://extensions/`.
3. Enable **Developer Mode** using the toggle in the top-right corner.
4. Click **Load Unpacked** in the top-left corner.
5. Select the cloned/downloaded `Youtube_Screenshoot` project folder.
6. The extension is now active and ready.

---

## ⚙️ How to Use

1. Open any YouTube video.
2. Click the **gear (⚙️) icon** on the right side of the video player controls.
3. Click the **Choose Folder** section to select the directory where screenshots will be saved (this permission is securely stored in IndexedDB).
4. Select your preferred **Format (JPG / TIF)** and bind your custom **Shortcut Key**.
5. Press the **Camera (📷) icon** or your assigned shortcut key (e.g., **P**) to take a screenshot.
6. A clean iOS-style notification will slide in from the top right, and the screenshot will be saved directly into your folder.

---

## 📄 License

MIT — Feel free to use, modify, and distribute this project.
