/**
 * content.js — YouTube Frame Catcher & Metadata Stamper
 *
 * Injects a "Capture" button into YouTube's player controls.
 * On click:
 *   1. Reads format preference from chrome.storage
 *   2. Captures the current video frame at native resolution
 *   3. Stamps metadata overlay (title, channel, URL, timecode)
 *   4. Encodes to TIF (lossless) or JPG and triggers download
 *
 * Compatible: Chrome 88+, Edge 88+ | Manifest V3
 */

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  const BUTTON_ID    = 'yt-frame-catcher-btn';
  const UTIF_TIMEOUT = 5000; // ms to wait for utif.js injection

  // ── Utility: sanitize filename ────────────────────────────────────────────
  function sanitizeFilename(str) {
    return str
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 120);
  }

  // ── Utility: format seconds → HH:MM:SS ────────────────────────────────────
  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ── Utility: get video metadata ───────────────────────────────────────────
  function getVideoMeta() {
    const video = document.querySelector('video');
    if (!video) return null;

    const currentTime = video.currentTime || 0;
    const timecode    = formatTime(currentTime);
    const seconds     = Math.floor(currentTime);

    // Title — try multiple selectors for YouTube's changing DOM
    const titleEl =
      document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
      document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string') ||
      document.querySelector('#title h1 yt-formatted-string') ||
      document.querySelector('ytd-watch-metadata h1') ||
      document.querySelector('h1.title');
    const title = titleEl ? titleEl.textContent.trim() : 'Unknown Title';

    // Channel
    const channelEl =
      document.querySelector('ytd-channel-name #text a') ||
      document.querySelector('#channel-name #text a') ||
      document.querySelector('.ytd-channel-name a') ||
      document.querySelector('#owner-name a');
    const channel = channelEl ? channelEl.textContent.trim() : 'Unknown Channel';

    // URL with timecode
    const baseUrl = window.location.href.split('&t=')[0];
    const url     = `${baseUrl}&t=${seconds}s`;

    return { video, currentTime, timecode, seconds, title, channel, url };
  }

  // ── Core: capture frame and download ─────────────────────────────────────
  async function captureFrame() {
    const meta = getVideoMeta();
    if (!meta) {
      console.warn('[FrameCatcher] No video element found.');
      return;
    }

    const { video, timecode, seconds, title, channel, url } = meta;

    // Read user prefs
    const prefs = await new Promise((resolve) => {
      chrome.storage.local.get(['format', 'jpgQuality'], (data) => {
        resolve({
          format:     data.format     || 'tif',
          jpgQuality: data.jpgQuality || 95,
        });
      });
    });

    // ── Canvas at native video resolution ────────────────────────────────
    const W = video.videoWidth  || 1920;
    const H = video.videoHeight || 1080;

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Draw video frame
    try {
      ctx.drawImage(video, 0, 0, W, H);
    } catch (err) {
      console.error('[FrameCatcher] drawImage failed (CORS?):', err);
      showToast('⚠️ Frame yakalanamadı. Video hazır mı?', 'error');
      return;
    }

    // ── Encode and download ───────────────────────────────────────────────
    // No overlay — image is saved pixel-perfect, metadata lives in filename only.
    const timeLabel  = timecode.replace(/:/g, '-'); // HH-MM-SS (colons invalid in filenames)
    const safeName   = sanitizeFilename(channel) + '_' + sanitizeFilename(title) + '_' + timeLabel;
    const ext        = prefs.format === 'jpg' ? 'jpg' : 'tif';
    const filename   = `${safeName}.${ext}`;

    try {
      let dataUrl;

      if (prefs.format === 'jpg') {
        // JPEG encoding via native Canvas API
        dataUrl = canvas.toDataURL('image/jpeg', prefs.jpgQuality / 100);
        triggerDownload(dataUrl, filename);

      } else {
        // TIF lossless encoding via UTIF.js
        const imageData = ctx.getImageData(0, 0, W, H);
        encodeTIF(imageData, W, H, filename);
      }

      showToast(`✓ Kaydedildi: ${filename}`, 'success');

    } catch (err) {
      console.error('[FrameCatcher] Encoding error:', err);
      showToast('⚠️ Kodlama hatası. Konsolu kontrol et.', 'error');
    }
  }

  // ── TIF Encoding (UTIF.js wrapper) ───────────────────────────────────────
  function encodeTIF(imageData, width, height, filename) {
    if (typeof UTIF === 'undefined') {
      console.error('[FrameCatcher] UTIF not loaded — falling back to PNG');
      showToast('⚠️ UTIF yüklenemedi, PNG olarak kaydediliyor.', 'error');
      // Fallback: use PNG
      const canvas2 = document.createElement('canvas');
      canvas2.width  = width;
      canvas2.height = height;
      canvas2.getContext('2d').putImageData(imageData, 0, 0);
      triggerDownload(canvas2.toDataURL('image/png'), filename.replace('.tif', '.png'));
      return;
    }

    try {
      // UTIF.encodeImage expects a Uint8Array of RGBA pixels
      const rgba   = new Uint8Array(imageData.data.buffer);
      const tifBuf = UTIF.encodeImage(rgba, width, height);
      const blob   = new Blob([tifBuf], { type: 'image/tiff' });
      triggerDownloadBlob(blob, filename);
    } catch (err) {
      console.error('[FrameCatcher] UTIF encode error:', err);
      showToast('⚠️ TIF hatası. PNG ile devam ediliyor.', 'error');
    }
  }

  // ── Download helpers ──────────────────────────────────────────────────────
  function triggerDownload(dataUrl, filename) {
    const a = document.createElement('a');
    a.href     = dataUrl;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 500);
  }

  function triggerDownloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  // ── Toast Notification ────────────────────────────────────────────────────
  let toastTimeout;
  function showToast(message, type = 'success') {
    let toast = document.getElementById('yt-fc-toast');

    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'yt-fc-toast';
      Object.assign(toast.style, {
        position:        'fixed',
        bottom:          '80px',
        right:           '24px',
        zIndex:          '99999',
        padding:         '12px 18px',
        borderRadius:    '10px',
        fontFamily:      '"Inter", "Arial", sans-serif',
        fontSize:        '13px',
        fontWeight:      '600',
        backdropFilter:  'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow:       '0 8px 32px rgba(0,0,0,0.4)',
        transition:      'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        transform:       'translateY(20px)',
        opacity:         '0',
        border:          '1px solid',
        maxWidth:        '380px',
        lineHeight:      '1.4',
        pointerEvents:   'none',
      });
      document.body.appendChild(toast);
    }

    // Style by type
    if (type === 'success') {
      toast.style.background    = 'rgba(0, 20, 5, 0.9)';
      toast.style.color         = '#00e676';
      toast.style.borderColor   = 'rgba(0,230,118,0.3)';
    } else {
      toast.style.background    = 'rgba(20, 0, 0, 0.9)';
      toast.style.color         = '#ff5252';
      toast.style.borderColor   = 'rgba(255,82,82,0.3)';
    }

    toast.textContent = message;

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity   = '1';
      toast.style.transform = 'translateY(0)';
    });

    // Auto-hide
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.style.opacity   = '0';
      toast.style.transform = 'translateY(20px)';
    }, 3200);
  }

  // ── Inject Capture Button ─────────────────────────────────────────────────
  function injectCaptureButton() {
    if (document.getElementById(BUTTON_ID)) return; // Already injected

    const controls =
      document.querySelector('.ytp-right-controls') ||
      document.querySelector('.ytp-chrome-controls .ytp-right-controls');

    if (!controls) return;

    const btn = document.createElement('button');
    btn.id         = BUTTON_ID;
    btn.title      = 'Frame Catcher — Kareyi Yakala';
    btn.className  = 'ytp-button';
    btn.setAttribute('aria-label', 'Frame Catcher');

    // SVG icon (camera)
    btn.innerHTML = `
      <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%"
           xmlns="http://www.w3.org/2000/svg" fill="white" style="filter:drop-shadow(0 0 3px rgba(255,255,255,0.3))">
        <g>
          <path d="M27,11 L24.5,11 L23,8.5 C22.7,8 22.1,7.7 21.5,7.7 L14.5,7.7 C13.9,7.7 13.3,8 13,8.5 L11.5,11 L9,11
                   C7.3,11 6,12.3 6,14 L6,24 C6,25.7 7.3,27 9,27 L27,27 C28.7,27 30,25.7 30,24 L30,14
                   C30,12.3 28.7,11 27,11 Z M18,24 C15.2,24 13,21.8 13,19 C13,16.2 15.2,14 18,14 C20.8,14 23,16.2 23,19
                   C23,21.8 20.8,24 18,24 Z"/>
          <circle cx="18" cy="19" r="2.5"/>
        </g>
      </svg>`;

    btn.style.cssText = `
      width: 36px;
      height: 36px;
      opacity: 0.9;
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s, transform 0.15s;
    `;

    btn.addEventListener('mouseenter', () => {
      btn.style.opacity   = '1';
      btn.style.transform = 'scale(1.12)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.opacity   = '0.9';
      btn.style.transform = 'scale(1)';
    });
    btn.addEventListener('click', () => {
      btn.style.transform = 'scale(0.9)';
      setTimeout(() => { btn.style.transform = 'scale(1)'; }, 150);
      captureFrame();
    });

    // Insert before the first button in right-controls
    controls.insertBefore(btn, controls.firstChild);
    console.log('[FrameCatcher] Capture button injected ✓');
  }

  // ── Observer: watch for player controls to appear/re-render ──────────────
  function startObserver() {
    const observer = new MutationObserver(() => {
      injectCaptureButton();
    });

    observer.observe(document.body, {
      childList: true,
      subtree:   true,
    });

    // Also try immediately
    injectCaptureButton();
  }

  // ── Page navigation (YouTube is a SPA) ───────────────────────────────────
  let lastUrl = location.href;

  function onNavigate() {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      // Remove old button and re-inject
      const old = document.getElementById(BUTTON_ID);
      if (old) old.remove();
      setTimeout(injectCaptureButton, 1500);
    }
  }

  // ── UTIF.js injection (loads from extension bundle) ───────────────────────
  function loadUTIF() {
    if (typeof UTIF !== 'undefined') return;
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('utif.js');
    script.onload = () => console.log('[FrameCatcher] UTIF.js loaded ✓');
    script.onerror = () => console.warn('[FrameCatcher] UTIF.js could not be loaded. TIF will fallback to PNG.');
    (document.head || document.documentElement).appendChild(script);
  }

  // ── Initialise ────────────────────────────────────────────────────────────
  function init() {
    loadUTIF();
    startObserver();

    // Intercept YouTube SPA navigation via pushState / popstate
    const origPush    = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = (...args) => { origPush(...args); onNavigate(); };
    history.replaceState = (...args) => { origReplace(...args); onNavigate(); };
    window.addEventListener('popstate', onNavigate);
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
