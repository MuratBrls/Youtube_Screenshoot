/**
 * content.js — YouTube Frame Catcher  v1.2
 *
 * Fixes:
 *  - UTIF now loaded via content_scripts (same isolated world) — TIF works
 *  - Download: tries background.js first, falls back to <a> tag silently
 *  - Keyboard shortcut: cached prefs, no async on keydown
 *  - Notification: inline styles only, no external CSS, guaranteed visible
 *  - Settings gear button injected next to capture button in player
 */

(function () {
  'use strict';

  // ── Cached prefs (updated on storage change) ──────────────────────────────
  let prefs = { format: 'tif', jpgQuality: 95, saveFolder: 'YouTube Frames', shortcutKey: 'p' };

  function reloadPrefs() {
    chrome.storage.local.get(['format', 'jpgQuality', 'saveFolder', 'shortcutKey'], (d) => {
      prefs.format      = d.format      || 'tif';
      prefs.jpgQuality  = d.jpgQuality  || 95;
      prefs.saveFolder  = d.saveFolder  || 'YouTube Frames';
      prefs.shortcutKey = (d.shortcutKey || 'p').toLowerCase();
    });
  }
  reloadPrefs();
  chrome.storage.onChanged.addListener(reloadPrefs);

  // ── Utilities ─────────────────────────────────────────────────────────────
  function sanitize(s) {
    return (s || '').replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_')
      .replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 100);
  }

  function fmtTime(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    const p = n => String(n).padStart(2, '0');
    return h > 0 ? `${p(h)}-${p(m)}-${p(s)}` : `${p(m)}-${p(s)}`;
  }

  function bufToDataUrl(buf, mime) {
    const bytes = new Uint8Array(buf);
    let b = '';
    for (let i = 0; i < bytes.length; i += 8192)
      b += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return `data:${mime};base64,` + btoa(b);
  }

  // ── Mac-style slide-in notification ──────────────────────────────────────
  let dismissTimer = null;

  function notify(msg, ok) {
    const prev = document.getElementById('yt-fc-notif');
    if (prev) { prev.remove(); clearTimeout(dismissTimer); }

    const n = document.createElement('div');
    n.id = 'yt-fc-notif';

    const accent = ok ? '#30d158' : '#ff453a';
    const icon   = ok ? '✓' : '⚠';

    // All styling inline — avoids YouTube CSP / style conflicts
    n.style.cssText = [
      'position:fixed', 'top:18px', 'right:-290px', 'z-index:2147483647',
      'width:268px', 'padding:11px 13px',
      'display:flex', 'align-items:center', 'gap:10px',
      'background:rgba(20,20,22,0.95)',
      `border:1px solid ${accent}44`,
      'border-radius:12px',
      'box-shadow:0 8px 28px rgba(0,0,0,0.55)',
      'backdrop-filter:blur(20px)',
      '-webkit-backdrop-filter:blur(20px)',
      'font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif',
      'font-size:12px', 'color:#f0f0f0',
      'transition:right 0.38s cubic-bezier(0.34,1.56,0.64,1)',
      'pointer-events:none',
    ].join(';');

    n.innerHTML = `
      <span style="font-size:15px;line-height:1;color:${accent};flex-shrink:0;font-weight:700;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:11.5px;margin-bottom:2px;color:#f5f5f5;">Frame Catcher</div>
        <div style="color:rgba(255,255,255,0.42);font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${msg}">${msg}</div>
      </div>
    `;

    document.body.appendChild(n);

    // Trigger slide-in (double rAF needed for transition to fire)
    requestAnimationFrame(() => requestAnimationFrame(() => { n.style.right = '18px'; }));

    // Auto dismiss
    dismissTimer = setTimeout(() => {
      n.style.right = '-290px';
      setTimeout(() => n && n.remove(), 420);
    }, 3000);
  }

  // ── Download: background.js → fallback to <a> ────────────────────────────
  function startDownload(dataUrl, folder, filename) {
    // Try background.js for folder support (no dialog)
    chrome.runtime.sendMessage(
      { action: 'download', dataUrl, folder, filename },
      (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.success) {
          // Fallback: direct <a> download (goes to default Downloads)
          directDownload(dataUrl, filename);
        }
      }
    );
  }

  function directDownload(dataUrl, filename) {
    const a   = document.createElement('a');
    a.href     = dataUrl;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 500);
  }

  // ── Capture frame ─────────────────────────────────────────────────────────
  function captureFrame() {
    const video = document.querySelector('video');
    if (!video || !video.videoWidth) { notify('Video bulunamadı', false); return; }

    const timeLabel = fmtTime(video.currentTime || 0);

    const titleEl =
      document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
      document.querySelector('#title h1 yt-formatted-string') ||
      document.querySelector('ytd-watch-metadata h1') ||
      document.querySelector('h1.title');
    const title = titleEl ? titleEl.textContent.trim() : 'Video';

    const chanEl =
      document.querySelector('ytd-channel-name #text a') ||
      document.querySelector('#channel-name #text a') ||
      document.querySelector('#owner-name a');
    const channel = chanEl ? chanEl.textContent.trim() : 'Channel';

    const W = video.videoWidth;
    const H = video.videoHeight;

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    try {
      ctx.drawImage(video, 0, 0, W, H);
    } catch (e) {
      notify('Frame yakalanamadı', false); return;
    }

    const folder = prefs.saveFolder || 'YouTube Frames';
    let dataUrl, filename;

    try {
      if (prefs.format === 'jpg') {
        dataUrl  = canvas.toDataURL('image/jpeg', prefs.jpgQuality / 100);
        filename = `${sanitize(channel)}_${sanitize(title)}_${timeLabel}.jpg`;
      } else {
        // TIF — UTIF is loaded via content_scripts, so it's accessible here
        if (typeof UTIF === 'undefined') {
          notify('UTIF yok → PNG kaydediliyor', false);
          dataUrl  = canvas.toDataURL('image/png');
          filename = `${sanitize(channel)}_${sanitize(title)}_${timeLabel}.png`;
        } else {
          const imgData = ctx.getImageData(0, 0, W, H);
          const tifBuf  = UTIF.encodeImage(new Uint8Array(imgData.data.buffer), W, H);
          dataUrl  = bufToDataUrl(tifBuf, 'image/tiff');
          filename = `${sanitize(channel)}_${sanitize(title)}_${timeLabel}.tif`;
        }
      }
    } catch (e) {
      notify('Encode hatası: ' + e.message, false); return;
    }

    startDownload(dataUrl, folder, filename);
    notify(filename, true);
  }

  // ── In-player settings panel ──────────────────────────────────────────────
  function toggleSettingsPanel() {
    const existing = document.getElementById('yt-fc-panel');
    if (existing) { existing.remove(); return; }

    // Find player container for absolute positioning
    const player = document.querySelector('.html5-video-player') ||
                   document.querySelector('#movie_player') ||
                   document.querySelector('.ytp-chrome-bottom')?.parentElement;

    const panel = document.createElement('div');
    panel.id = 'yt-fc-panel';
    panel.style.cssText = [
      'position:absolute', 'bottom:54px', 'right:8px', 'z-index:9999',
      'width:230px', 'padding:13px 14px',
      'background:rgba(16,16,18,0.97)',
      'border:1px solid rgba(255,255,255,0.09)',
      'border-radius:12px',
      'box-shadow:0 14px 40px rgba(0,0,0,0.65)',
      'backdrop-filter:blur(18px)',
      '-webkit-backdrop-filter:blur(18px)',
      'font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif',
      'font-size:12px', 'color:#ddd',
      'opacity:0', 'transform:translateY(6px)',
      'transition:opacity 0.22s ease,transform 0.22s ease',
    ].join(';');

    const curFolder  = prefs.saveFolder  || 'YouTube Frames';
    const curKey     = (prefs.shortcutKey || 'p').toUpperCase();

    panel.innerHTML = `
      <div style="font-weight:700;font-size:12px;margin-bottom:11px;display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#f0f0f0;">⚙&nbsp; Ayarlar</span>
        <span id="fc-close" style="cursor:pointer;color:#555;font-size:15px;line-height:1;padding:0 2px;">✕</span>
      </div>

      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#555;margin-bottom:5px;">Kayıt Klasörü</div>
      <input id="fc-folder" type="text" value="${curFolder}" placeholder="YouTube Frames"
        style="width:100%;box-sizing:border-box;background:#0d0d0f;border:1px solid #252528;border-radius:7px;
               padding:7px 9px;font-size:11.5px;color:#ddd;outline:none;font-family:inherit;
               transition:border-color 0.18s;">
      <div id="fc-folder-hint" style="font-size:10px;color:#404040;margin-top:4px;">
        İndirilenler / <b style="color:#555;">${curFolder}</b>
      </div>

      <div style="height:1px;background:#1c1c1e;margin:11px 0;"></div>

      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#555;margin-bottom:6px;">Kısayol Tuşu</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span id="fc-kbd" style="background:#1c1c1e;border:1px solid #2a2a2e;border-radius:6px;
                                  padding:4px 12px;font-size:13px;font-weight:700;font-family:monospace;
                                  color:#ccc;letter-spacing:0.06em;">${curKey}</span>
        <button id="fc-rec" style="font-size:10px;padding:4px 9px;border-radius:6px;cursor:pointer;
                                    border:1px solid rgba(255,50,50,0.3);background:rgba(255,0,0,0.06);
                                    color:#ff4040;font-family:inherit;font-weight:600;">Değiştir</button>
      </div>
      <div id="fc-rec-hint" style="font-size:10px;color:#3a3a3e;margin-top:5px;">${curKey} tuşuna bas → yakala</div>

      <button id="fc-save" style="width:100%;margin-top:13px;padding:8px;border:none;border-radius:8px;
                                   background:linear-gradient(135deg,#b80000,#ff0000);
                                   color:#fff;font-size:12px;font-weight:600;font-family:inherit;
                                   cursor:pointer;transition:opacity 0.2s;">Kaydet</button>
    `;

    if (player) {
      player.style.position = 'relative';
      player.appendChild(panel);
    } else {
      document.body.appendChild(panel);
    }

    // Animate in
    requestAnimationFrame(() => requestAnimationFrame(() => {
      panel.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
    }));

    const folderInp = panel.querySelector('#fc-folder');
    const folderHint = panel.querySelector('#fc-folder-hint');
    const kbdEl      = panel.querySelector('#fc-kbd');
    const recBtn     = panel.querySelector('#fc-rec');
    const recHint    = panel.querySelector('#fc-rec-hint');
    const saveBtn    = panel.querySelector('#fc-save');

    // Live folder preview
    folderInp.addEventListener('input', () => {
      const v = folderInp.value.trim() || 'YouTube Frames';
      folderHint.innerHTML = `İndirilenler / <b style="color:#555;">${v}</b>`;
    });
    folderInp.addEventListener('focus', () => { folderInp.style.borderColor = '#990000'; });
    folderInp.addEventListener('blur',  () => { folderInp.style.borderColor = '#252528'; });

    // Shortcut recorder
    let recording = false;
    recBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      recording = !recording;
      if (recording) {
        recBtn.textContent = 'İptal';
        recBtn.style.color = '#ff9f0a';
        recBtn.style.borderColor = 'rgba(255,136,0,0.3)';
        kbdEl.textContent = '·';
        recHint.textContent = 'Herhangi bir tuşa bas…';
        recHint.style.color = '#ff9f0a';
      } else {
        recBtn.textContent = 'Değiştir';
        recBtn.style.color = '#ff4040';
        recBtn.style.borderColor = 'rgba(255,50,50,0.3)';
        kbdEl.textContent = (prefs.shortcutKey || 'p').toUpperCase();
        recHint.textContent = kbdEl.textContent + ' tuşuna bas → yakala';
        recHint.style.color = '#3a3a3e';
      }
    });

    panel.addEventListener('keydown', (e) => {
      if (!recording) return;
      if (['Control','Shift','Alt','Meta','CapsLock','Tab','Escape'].includes(e.key)) {
        if (e.key === 'Escape') recBtn.click();
        return;
      }
      e.preventDefault(); e.stopPropagation();
      recording = false;
      const k = e.key.toLowerCase();
      kbdEl.textContent = k.toUpperCase();
      recHint.textContent = k.toUpperCase() + ' tuşuna bas → yakala';
      recHint.style.color = '#3a3a3e';
      recBtn.textContent = 'Değiştir';
      recBtn.style.color = '#ff4040';
      recBtn.style.borderColor = 'rgba(255,50,50,0.3)';
    }, true);

    // Save
    saveBtn.addEventListener('click', () => {
      const folder = folderInp.value.trim() || 'YouTube Frames';
      const key    = kbdEl.textContent.trim().toLowerCase() || 'p';
      chrome.storage.local.set({ saveFolder: folder, shortcutKey: key }, () => {
        prefs.saveFolder  = folder;
        prefs.shortcutKey = key;
        saveBtn.textContent = '✓ Kaydedildi';
        saveBtn.style.background = 'linear-gradient(135deg,#1a6a30,#30d158)';
        setTimeout(() => { panel.remove(); }, 1000);
      });
    });

    // Close button
    panel.querySelector('#fc-close').addEventListener('click', () => panel.remove());

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function outside(e) {
        if (!panel.contains(e.target) && e.target.id !== 'yt-fc-settings-btn') {
          panel.remove();
          document.removeEventListener('click', outside);
        }
      });
    }, 150);
  }

  // ── Inject buttons into player ────────────────────────────────────────────
  function injectButtons() {
    if (document.getElementById('yt-fc-btn')) return;

    const controls =
      document.querySelector('.ytp-right-controls') ||
      document.querySelector('.ytp-chrome-controls .ytp-right-controls');
    if (!controls) return;

    const settingsBtn = makeBtn(
      'yt-fc-settings-btn',
      'Frame Catcher Ayarlar',
      /* gear SVG */
      `<svg viewBox="0 0 24 24" width="22" height="22" fill="white" style="opacity:0.75;">
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61
                 l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54
                 c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54
                 c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87
                 c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94
                 l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22
                 l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84
                 c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96
                 c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58z
                 M12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
      </svg>`,
      () => toggleSettingsPanel()
    );

    const captureBtn = makeBtn(
      'yt-fc-btn',
      'Frame Catcher — Kareyi Yakala (kısayol: ' + prefs.shortcutKey.toUpperCase() + ')',
      /* camera SVG */
      `<svg viewBox="0 0 36 36" width="100%" height="100%" fill="white">
        <path d="M27,11L24.5,11L23,8.5C22.7,8,22.1,7.7,21.5,7.7L14.5,7.7C13.9,7.7,13.3,8,13,8.5
                 L11.5,11L9,11C7.3,11,6,12.3,6,14L6,24C6,25.7,7.3,27,9,27L27,27C28.7,27,30,25.7,30,24
                 L30,14C30,12.3,28.7,11,27,11ZM18,24C15.2,24,13,21.8,13,19C13,16.2,15.2,14,18,14
                 C20.8,14,23,16.2,23,19C23,21.8,20.8,24,18,24Z"/>
        <circle cx="18" cy="19" r="2.5"/>
      </svg>`,
      () => captureFrame()
    );

    controls.insertBefore(settingsBtn, controls.firstChild);
    controls.insertBefore(captureBtn, controls.firstChild);
  }

  function makeBtn(id, title, svgHtml, onClick) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.title = title;
    btn.className = 'ytp-button';
    btn.innerHTML = svgHtml;
    btn.style.cssText = 'width:36px;height:36px;opacity:0.9;cursor:pointer;background:none;border:none;padding:0;display:inline-flex;align-items:center;justify-content:center;transition:opacity 0.2s,transform 0.15s;';
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '1';   btn.style.transform = 'scale(1.1)'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.9'; btn.style.transform = 'scale(1)';   });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.style.transform = 'scale(0.88)';
      setTimeout(() => { btn.style.transform = 'scale(1)'; }, 140);
      onClick();
    });
    return btn;
  }

  // ── Keyboard shortcut ─────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;
    if (document.getElementById('yt-fc-panel')) return; // panel open = might be recording

    if (e.key.toLowerCase() === prefs.shortcutKey) {
      const vid = document.querySelector('video');
      if (vid && vid.videoWidth) {
        e.preventDefault();
        captureFrame();
      }
    }
  }, true);

  // ── MutationObserver + SPA navigation ────────────────────────────────────
  new MutationObserver(() => injectButtons())
    .observe(document.body, { childList: true, subtree: true });

  let lastUrl = location.href;
  function onNav() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    ['yt-fc-btn', 'yt-fc-settings-btn', 'yt-fc-panel'].forEach(id => {
      document.getElementById(id)?.remove();
    });
    setTimeout(injectButtons, 1200);
  }
  const _ps = history.pushState.bind(history);
  const _rs = history.replaceState.bind(history);
  history.pushState    = (...a) => { _ps(...a); onNav(); };
  history.replaceState = (...a) => { _rs(...a); onNav(); };
  window.addEventListener('popstate', onNav);

  // ── Init ──────────────────────────────────────────────────────────────────
  injectButtons();

})();
