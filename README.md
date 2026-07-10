# 🎬 YouTube Frame Catcher & Metadata Stamper

A lightweight Chrome/Edge extension that captures the current YouTube video frame at **native resolution** (1080p, 4K, etc.) and saves it as a **lossless TIF** or **compressed JPG** — with all metadata embedded directly in the filename.

![Chrome](https://img.shields.io/badge/Chrome-88%2B-4285F4?logo=google-chrome&logoColor=white)
![Edge](https://img.shields.io/badge/Edge-88%2B-0078D7?logo=microsoft-edge&logoColor=white)
![Manifest](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ Features

- 📷 **One-click frame capture** — injects a camera button directly into YouTube's player controls
- 🖼️ **Native resolution** — captures at the actual video resolution (1920×1080, 3840×2160, etc.)
- 🗂️ **TIF (lossless)** — perfect for Premiere Pro / After Effects color grading and masking
- 📦 **JPG (compressed)** — adjustable quality (60–100%) for lightweight reference shots
- 🏷️ **Metadata in filename** — `Channel_Title_HH-MM-SS.tif` — zero watermark on the image itself
- ⚡ **SPA-aware** — survives YouTube's single-page navigation between videos
- 🚫 **No server, no tracking** — 100% client-side, runs entirely in the browser

---

## 📁 Project Structure

```
Youtube_Screenshoot/
├── manifest.json       ← Manifest V3 — permissions & config
├── content.js          ← Core logic injected into YouTube
├── popup.html          ← Settings UI (format selector + quality slider)
├── popup.js            ← Storage read/write logic
├── utif.js             ← UTIF.js — lossless TIF encoder (by Photopea)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 🚀 Installation (No build step needed)

> Works on **Windows** and **macOS** — Chrome or Edge.

### 1. Clone the repo

```bash
git clone https://github.com/MuratBrls/Youtube_Screenshoot.git
```

### 2. Load in Chrome / Edge

1. Go to `chrome://extensions/` (or `edge://extensions/`)
2. Enable **Developer mode** (top-right toggle)
3. Click **"Load unpacked"**
4. Select the cloned `Youtube_Screenshoot` folder
5. ✅ Extension is active immediately

---

## 🎯 How to Use

### Select Output Format
Click the **Frame Catcher** icon in the browser toolbar → choose **TIF** or **JPG** → set JPG quality if needed → click **"Kaydet & Uygula"**.

### Capture a Frame
1. Open any YouTube video
2. Pause or scrub to the exact frame you want
3. Click the **📷 camera icon** in the player's right control bar
4. File downloads instantly

### Output Filename Format
```
ChannelName_VideoTitle_HH-MM-SS.tif
```
Example:
```
Kurzgesagt_The_Fermi_Paradox_00-14-37.tif
```

---

## 🖼️ Format Guide

| Format | Use Case | Quality |
|--------|----------|---------|
| **TIF** | Color grading, masking, compositing in Premiere / After Effects | Lossless — pixel perfect |
| **JPG** | Quick reference, mood boards, lightweight sharing | Adjustable 60–100% |

---

## ⚙️ Technical Details

| Feature | Detail |
|---------|--------|
| TIF Encoder | [UTIF.js](https://github.com/photopea/UTIF.js) by Photopea |
| Capture API | `HTMLCanvasElement.drawImage()` |
| Storage | `chrome.storage.local` |
| Navigation | Intercepts `history.pushState` for SPA support |
| Permissions | `storage`, `downloads`, `activeTab`, `tabs` |

---

## 📄 License

MIT — free to use, modify, and distribute.

---

> **Tip:** After updating any file, go to `chrome://extensions/` and click the **↺ reload** button on the extension card to apply changes.
