/**
 * content.js — YouTube Frame Catcher & Metadata Stamper  v1.1
 *
 * • Injects a Capture button into YouTube's right player controls
 * • Keyboard shortcut support (default: P)
 * • Downloads via background.js → no "Save As" dialog, goes to chosen folder
 * • Mac-style frosted-glass notification (top-right slide-in)
 */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const BUTTON_ID = 'yt-frame-catcher-btn';

  // ── Cached shortcut key (updated on storage change) ────────────────────────
  let shortcutKey = 'p';
  chrome.storage.local.get(['shortcutKey'], (d) => {
    shortcutKey = (d.shortcutKey || 'p').toLowerCase();
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.shortcutKey) shortcutKey = changes.shortcutKey.newValue.toLowerCase();
  });

  // ── Utility: sanitize filename ─────────────────────────────────────────────
  function sanitizeFilename(str) {
    return (str || '')
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 120);
  }

  // ── Utility: seconds → HH:MM:SS ───────────────────────────────────────────
  function formatTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  // ── Utility: ArrayBuffer → base64 data URL (chunked for large files) ───────
  function bufferToDataUrl(buffer, mime) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return `data:${mime};base64,` + btoa(binary);
  }

  // ── Utility: read preferences ──────────────────────────────────────────────
  function getPrefs() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ['format', 'jpgQuality', 'saveFolder', 'shortcutKey'],
        (d) => resolve({
          format:     d.format      || 'tif',
          jpgQuality: d.jpgQuality  || 95,
          saveFolder: d.saveFolder  || 'YouTube Frames',
          shortcutKey: (d.shortcutKey || 'p').toLowerCase(),
        })
      );
    });
  }

  // ── Utility: get video metadata ────────────────────────────────────────────
  function getVideoMeta() {
    const video = document.querySelector('video');
    if (!video) return null;

    const currentTime = video.currentTime || 0;
    const timecode    = formatTime(currentTime);

    const titleEl =
      document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
      document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string') ||
      document.querySelector('#title h1 yt-formatted-string') ||
      document.querySelector('ytd-watch-metadata h1') ||
      document.querySelector('h1.title');
    const title = titleEl ? titleEl.textContent.trim() : 'Unknown_Title';

    const channelEl =
      document.querySelector('ytd-channel-name #text a') ||
      document.querySelector('#channel-name #text a') ||
      document.querySelector('.ytd-channel-name a') ||
      document.querySelector('#owner-name a');
    const channel = channelEl ? channelEl.textContent.trim() : 'Unknown_Channel';

    return { video, timecode, title, channel };
  }

  // ── Send download request to background.js ─────────────────────────────────
  function requestDownload(dataUrl, folder, filename) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'download', dataUrl, folder, filename },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && !response.success) {
            reject(new Error(response.error || 'Download failed'));
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  // ── Core: capture, encode, download ───────────────────────────────────────
  async function captureFrame() {
    const meta = getVideoMeta();
    if (!meta) {
      showNotification('Video bulunamadı', 'error');
      return;
    }

    const { video, timecode, title, channel } = meta;
    const prefs = await getPrefs();

    const W = video.videoWidth  || 1920;
    const H = video.videoHeight || 1080;

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    try {
      ctx.drawImage(video, 0, 0, W, H);
    } catch (err) {
      console.error('[FrameCatcher] drawImage failed:', err);
      showNotification('Frame yakalanamadı', 'error');
      return;
    }

    // Build filename
    const timeLabel = timecode.replace(/:/g, '-');
    const ext       = prefs.format === 'jpg' ? 'jpg' : 'tif';
    const filename  = `${sanitizeFilename(channel)}_${sanitizeFilename(title)}_${timeLabel}.${ext}`;
    const folder    = prefs.saveFolder || 'YouTube Frames';

    try {
      let dataUrl;

      if (prefs.format === 'jpg') {
        dataUrl = canvas.toDataURL('image/jpeg', prefs.jpgQuality / 100);

      } else {
        // TIF via UTIF.js
        if (typeof UTIF === 'undefined') {
          // Fallback → PNG
          showNotification('UTIF yüklenmedi, PNG olarak kaydedildi', 'error');
          const pngName = filename.replace('.tif', '.png');
          dataUrl = canvas.toDataURL('image/png');
          await requestDownload(dataUrl, folder, pngName);
          return;
        }
        const imgData = ctx.getImageData(0, 0, W, H);
        const rgba    = new Uint8Array(imgData.data.buffer);
        const tifBuf  = UTIF.encodeImage(rgba, W, H);
        dataUrl = bufferToDataUrl(tifBuf, 'image/tiff');
      }

      await requestDownload(dataUrl, folder, filename);
      showNotification(filename, 'success');

    } catch (err) {
      console.error('[FrameCatcher] encode/download error:', err);
      showNotification('Kaydedilemedi: ' + err.message, 'error');
    }
  }

  // ── Mac-style frosted-glass notification ──────────────────────────────────
  const NOTIF_CSS = `
    @keyframes _fcIn  { from { transform:translateX(380px); opacity:0 } to { transform:translateX(0); opacity:1 } }
    @keyframes _fcOut { from { transform:translateX(0); opacity:1 } to { transform:translateX(380px); opacity:0 } }
    @keyframes _fcBar { from { width:100% } to { width:0% } }

    #yt-fc-notif {
      position:fixed; top:20px; right:20px; z-index:2147483647;
      width:340px;
      background:rgba(28,28,30,0.88);
      backdrop-filter:blur(24px) saturate(160%);
      -webkit-backdrop-filter:blur(24px) saturate(160%);
      border:1px solid rgba(255,255,255,0.10);
      border-radius:14px;
      box-shadow:0 20px 60px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07);
      overflow:hidden;
      font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",sans-serif;
      animation:_fcIn 0.42s cubic-bezier(0.34,1.56,0.64,1) forwards;
      cursor:default; user-select:none;
    }
    #yt-fc-notif.leaving {
      animation:_fcOut 0.3s cubic-bezier(0.55,0,0.1,1) forwards;
    }
    #yt-fc-notif .fc-body {
      display:flex; align-items:flex-start; gap:11px;
      padding:13px 13px 16px;
    }
    #yt-fc-notif .fc-icon {
      width:38px; height:38px; flex-shrink:0; border-radius:9px;
      display:flex; align-items:center; justify-content:center;
    }
    #yt-fc-notif .fc-text { flex:1; min-width:0; }
    #yt-fc-notif .fc-title {
      font-size:12.5px; font-weight:600; color:#f2f2f7;
      letter-spacing:-0.01em; margin-bottom:2px;
    }
    #yt-fc-notif .fc-sub {
      font-size:11.5px; color:rgba(255,255,255,0.48);
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      max-width:230px;
    }
    #yt-fc-notif .fc-close {
      font-size:12px; color:rgba(255,255,255,0.25);
      cursor:pointer; padding:3px 5px; flex-shrink:0; margin-top:-1px;
      border-radius:5px; transition:background 0.15s, color 0.15s;
      line-height:1;
    }
    #yt-fc-notif .fc-close:hover { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.6); }
    #yt-fc-notif .fc-bar-track {
      height:2.5px;
      background:rgba(255,255,255,0.06);
    }
    #yt-fc-notif .fc-bar {
      height:100%; animation:_fcBar 3.6s linear forwards;
    }
  `;

  let notifStyleInjected = false;
  function ensureNotifStyle() {
    if (notifStyleInjected) return;
    const s = document.createElement('style');
    s.id = 'yt-fc-notif-style';
    s.textContent = NOTIF_CSS;
    document.head.appendChild(s);
    notifStyleInjected = true;
  }

  let dismissTimer = null;

  function showNotification(message, type = 'success') {
    ensureNotifStyle();

    // Remove previous
    const prev = document.getElementById('yt-fc-notif');
    if (prev) prev.remove();
    clearTimeout(dismissTimer);

    const isSuccess = type === 'success';

    const iconColor  = isSuccess ? '#30d158' : '#ff453a';
    const iconBg     = isSuccess ? 'rgba(48,209,88,0.12)' : 'rgba(255,69,58,0.12)';
    const iconBorder = isSuccess ? 'rgba(48,209,88,0.25)' : 'rgba(255,69,58,0.25)';
    const barColor   = isSuccess ? '#30d158' : '#ff453a';

    const iconSvg = isSuccess
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
           <polyline points="20 6 9 17 4 12"/>
         </svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
           <circle cx="12" cy="12" r="10"/>
           <line x1="12" y1="8" x2="12" y2="12"/>
           <circle cx="12" cy="16" r="0.5" fill="${iconColor}"/>
         </svg>`;

    const notif = document.createElement('div');
    notif.id = 'yt-fc-notif';
    notif.innerHTML = `
      <div class="fc-body">
        <div class="fc-icon" style="background:${iconBg}; border:1px solid ${iconBorder};">
          ${iconSvg}
        </div>
        <div class="fc-text">
          <div class="fc-title">Frame Catcher</div>
          <div class="fc-sub" title="${message}">${message}</div>
        </div>
        <div class="fc-close" id="yt-fc-close">✕</div>
      </div>
      <div class="fc-bar-track">
        <div class="fc-bar" style="background:${barColor};"></div>
      </div>
    `;

    document.body.appendChild(notif);

    function dismiss() {
      const el = document.getElementById('yt-fc-notif');
      if (!el) return;
      el.classList.add('leaving');
      setTimeout(() => el && el.remove(), 310);
    }

    document.getElementById('yt-fc-close').onclick = dismiss;
    dismissTimer = setTimeout(dismiss, 3600);
  }

  // ── Keyboard shortcut ──────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const tag    = active ? active.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || active.isContentEditable) return;

    if (
      e.key.toLowerCase() === shortcutKey &&
      !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
    ) {
      // Make sure we have a video (we're on a watch page)
      if (document.querySelector('video')) {
        e.preventDefault();
        captureFrame();
      }
    }
  }, true);

  // ── Inject Capture Button ─────────────────────────────────────────────────
  function injectCaptureButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const controls =
      document.querySelector('.ytp-right-controls') ||
      document.querySelector('.ytp-chrome-controls .ytp-right-controls');
    if (!controls) return;

    const btn = document.createElement('button');
    btn.id        = BUTTON_ID;
    btn.title     = 'Frame Catcher — Kareyi Yakala';
    btn.className = 'ytp-button';
    btn.setAttribute('aria-label', 'Frame Catcher');

    btn.innerHTML = `
      <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%"
           xmlns="http://www.w3.org/2000/svg" fill="white">
        <path d="M27,11 L24.5,11 L23,8.5 C22.7,8 22.1,7.7 21.5,7.7 L14.5,7.7
                 C13.9,7.7 13.3,8 13,8.5 L11.5,11 L9,11
                 C7.3,11 6,12.3 6,14 L6,24 C6,25.7 7.3,27 9,27 L27,27
                 C28.7,27 30,25.7 30,24 L30,14 C30,12.3 28.7,11 27,11Z
                 M18,24 C15.2,24 13,21.8 13,19 C13,16.2 15.2,14 18,14
                 C20.8,14 23,16.2 23,19 C23,21.8 20.8,24 18,24Z"/>
        <circle cx="18" cy="19" r="2.5"/>
      </svg>`;

    Object.assign(btn.style, {
      width: '36px', height: '36px', opacity: '0.9', cursor: 'pointer',
      background: 'none', border: 'none', padding: '0',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      transition: 'opacity 0.2s, transform 0.15s',
    });

    btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; btn.style.transform = 'scale(1.12)'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.9'; btn.style.transform = 'scale(1)'; });
    btn.addEventListener('click', () => {
      btn.style.transform = 'scale(0.88)';
      setTimeout(() => { btn.style.transform = 'scale(1)'; }, 150);
      captureFrame();
    });

    controls.insertBefore(btn, controls.firstChild);
  }

  // ── Observer + SPA navigation ─────────────────────────────────────────────
  const observer = new MutationObserver(() => injectCaptureButton());
  observer.observe(document.body, { childList: true, subtree: true });

  let lastUrl = location.href;
  function onNavigate() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      const old = document.getElementById(BUTTON_ID);
      if (old) old.remove();
      setTimeout(injectCaptureButton, 1200);
    }
  }
  const origPush    = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState    = (...a) => { origPush(...a);    onNavigate(); };
  history.replaceState = (...a) => { origReplace(...a); onNavigate(); };
  window.addEventListener('popstate', onNavigate);

  // ── Load UTIF.js ──────────────────────────────────────────────────────────
  function loadUTIF() {
    if (typeof UTIF !== 'undefined') return;
    const s   = document.createElement('script');
    s.src     = chrome.runtime.getURL('utif.js');
    s.onload  = () => console.log('[FrameCatcher] UTIF.js loaded ✓');
    s.onerror = () => console.warn('[FrameCatcher] UTIF.js load failed — TIF will fallback to PNG');
    (document.head || document.documentElement).appendChild(s);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    loadUTIF();
    injectCaptureButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
