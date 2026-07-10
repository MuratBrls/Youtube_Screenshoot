/**
 * content.js — YouTube Frame Catcher  v1.4
 * - Settings panel: document.body + position:fixed (player events can't block it)
 * - Format selector (TIF / JPG) inside the panel
 * - Folder picker via showDirectoryPicker (FSA)
 * - White iOS-style notification
 */

(function () {
  'use strict';

  // ── Prefs ──────────────────────────────────────────────────────────────────
  let prefs = { format: 'jpg', jpgQuality: 95, shortcutKey: 'p' };

  function reloadPrefs() {
    chrome.storage.local.get(['format', 'jpgQuality', 'shortcutKey'], (d) => {
      prefs.format      = d.format      || 'jpg';
      prefs.jpgQuality  = d.jpgQuality  || 95;
      prefs.shortcutKey = (d.shortcutKey || 'p').toLowerCase();
    });
  }
  reloadPrefs();
  chrome.storage.onChanged.addListener(reloadPrefs);

  // ── IndexedDB — stores FileSystemDirectoryHandle ───────────────────────────
  let _db = null;

  function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('FrameCatcherDB', 1);
      r.onupgradeneeded = e => e.target.result.createObjectStore('store');
      r.onsuccess = e => { _db = e.target.result; res(_db); };
      r.onerror   = () => rej(r.error);
    });
  }

  async function idbSet(key, val) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('store', 'readwrite');
      tx.objectStore('store').put(val, key);
      tx.oncomplete = res;
      tx.onerror    = () => rej(tx.error);
    });
  }

  async function idbGet(key) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('store', 'readonly');
      const r  = tx.objectStore('store').get(key);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }

  // ── Utilities ──────────────────────────────────────────────────────────────
  function sanitize(s) {
    return (s || '')
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 100);
  }

  function fmtTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const p = n => String(n).padStart(2, '0');
    return h > 0 ? `${p(h)}-${p(m)}-${p(s)}` : `${p(m)}-${p(s)}`;
  }

  // ── White iOS notification ──────────────────────────────────────────────────
  let _dt = null;

  function notify(msg, ok = true) {
    const prev = document.getElementById('yt-fc-notif');
    if (prev) { prev.remove(); clearTimeout(_dt); }

    const accent = ok ? '#34c759' : '#ff3b30';
    const iconBg  = ok ? '#edfaf2' : '#fff0ee';
    const checkSvg = ok
      ? `<polyline points="20 6 9 17 4 12"/>`
      : `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>`;

    const n = document.createElement('div');
    n.id = 'yt-fc-notif';
    n.style.cssText = `
      position:fixed; top:16px; right:-280px; z-index:2147483647;
      width:256px; padding:10px 13px;
      display:flex; align-items:center; gap:10px;
      background:#fff;
      border:1px solid rgba(0,0,0,0.08);
      border-radius:14px;
      box-shadow:0 4px 20px rgba(0,0,0,0.11), 0 1px 4px rgba(0,0,0,0.05);
      font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;
      font-size:12px; color:#1c1c1e; pointer-events:none;
      transition:right 0.4s cubic-bezier(0.34,1.56,0.64,1);
    `;
    n.innerHTML = `
      <div style="width:30px;height:30px;flex-shrink:0;border-radius:8px;background:${iconBg};
                  display:flex;align-items:center;justify-content:center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="${accent}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
          ${checkSvg}
        </svg>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11.5px;font-weight:600;color:#1c1c1e;margin-bottom:1px;">Frame Catcher</div>
        <div style="font-size:10.5px;color:#8e8e93;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${msg}</div>
      </div>
    `;

    document.body.appendChild(n);
    requestAnimationFrame(() => requestAnimationFrame(() => { n.style.right = '16px'; }));

    _dt = setTimeout(() => {
      n.style.transition = 'right 0.3s ease, opacity 0.25s ease';
      n.style.right = '-280px'; n.style.opacity = '0';
      setTimeout(() => n.remove(), 330);
    }, 3000);
  }

  // ── Folder via File System Access API ──────────────────────────────────────
  async function pickFolder() {
    if (!window.showDirectoryPicker) {
      alert('Tarayıcınız klasör seçimini desteklemiyor. Chrome 86+ gerekli.');
      return null;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'yt-fc' });
      await idbSet('dirHandle', handle);
      await idbSet('dirName',   handle.name);
      chrome.storage.local.set({ savedFolderName: handle.name });
      return handle;
    } catch (e) {
      if (e.name !== 'AbortError') console.error('[FC] pickFolder:', e);
      return null;
    }
  }

  async function getHandle() {
    try { return await idbGet('dirHandle'); } catch { return null; }
  }

  async function writeFile(blob, filename) {
    const handle = await getHandle();
    if (!handle) return false;
    try {
      let perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return false;
      const fh  = await handle.getFileHandle(filename, { create: true });
      const w   = await fh.createWritable();
      await w.write(blob); await w.close();
      return true;
    } catch (e) {
      console.error('[FC] writeFile:', e);
      return false;
    }
  }

  // ── Fallback download ──────────────────────────────────────────────────────
  function fallbackDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 600);
  }

  // ── Capture ────────────────────────────────────────────────────────────────
  async function captureFrame() {
    const video = document.querySelector('video');
    if (!video || !video.videoWidth) { notify('Video bulunamadı', false); return; }

    // Video ID + exact second → reconstructable YouTube link
    // e.g.  dQw4w9WgXcQ_t553s.jpg  →  https://youtu.be/dQw4w9WgXcQ?t=553
    const videoId = new URLSearchParams(location.search).get('v') || 'video';
    const seconds = Math.floor(video.currentTime || 0);

    const W = video.videoWidth, H = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    try { ctx.drawImage(video, 0, 0, W, H); }
    catch (e) { notify('Frame yakalanamadı', false); return; }

    let blob, ext;
    try {
      if (prefs.format === 'jpg') {
        const dataUrl = canvas.toDataURL('image/jpeg', prefs.jpgQuality / 100);
        const bin = atob(dataUrl.split(',')[1]);
        const u8  = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        blob = new Blob([u8], { type: 'image/jpeg' });
        ext  = 'jpg';
      } else {
        if (typeof UTIF === 'undefined') {
          notify('TIF encoder yok → JPG olarak kaydediliyor', false);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
          const bin = atob(dataUrl.split(',')[1]);
          const u8  = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          blob = new Blob([u8], { type: 'image/jpeg' });
          ext  = 'jpg';
        } else {
          const imgData = ctx.getImageData(0, 0, W, H);
          const tifBuf  = UTIF.encodeImage(new Uint8Array(imgData.data.buffer), W, H);
          blob = new Blob([tifBuf], { type: 'image/tiff' });
          ext  = 'tif';
        }
      }
    } catch (e) {
      notify('Encode hatası: ' + e.message, false); return;
    }

    const filename = `youtu.be_${videoId}_t=${seconds}.${ext}`;

    const fsaOk = await writeFile(blob, filename);
    if (fsaOk) {
      const folderName = (await idbGet('dirName')) || 'klasör';
      notify(`${filename}  →  ${folderName}`, true);
    } else {
      fallbackDownload(blob, filename);
      notify(filename, true);
    }
  }

  // ── Settings Panel — appended to body, position:fixed ─────────────────────
  function toggleSettingsPanel() {
    const ex = document.getElementById('yt-fc-panel');
    if (ex) { ex.remove(); return; }

    // Position panel above the settings button
    const btn  = document.getElementById('yt-fc-settings-btn');
    const rect = btn ? btn.getBoundingClientRect() : { top: 100, right: 120 };
    const panelW = 248;
    const right  = Math.max(8, window.innerWidth - rect.right - 4);
    const bottom = Math.max(8, window.innerHeight - rect.top + 8);

    const p = document.createElement('div');
    p.id = 'yt-fc-panel';
    p.style.cssText = `
      position:fixed;
      bottom:${bottom}px;
      right:${right}px;
      z-index:2147483647;
      width:${panelW}px;
      padding:14px 15px;
      background:#ffffff;
      border:1px solid rgba(0,0,0,0.08);
      border-radius:14px;
      box-shadow:0 12px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.07);
      font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;
      font-size:12px; color:#1c1c1e;
      opacity:0; transform:translateY(6px);
      transition:opacity 0.2s ease, transform 0.2s ease;
    `;

    p.innerHTML = `
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <span style="font-weight:700;font-size:13px;color:#1c1c1e;">Ayarlar</span>
        <div id="fc-close" style="width:22px;height:22px;background:#f2f2f7;border-radius:50%;
                                    display:flex;align-items:center;justify-content:center;
                                    cursor:pointer;font-size:11px;color:#8e8e93;user-select:none;">✕</div>
      </div>

      <!-- Format -->
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#8e8e93;margin-bottom:7px;">Format</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;">
        <div id="fc-fmt-jpg" class="fc-fmt-card" data-fmt="jpg"
          style="padding:9px 6px;border-radius:10px;border:1.5px solid;
                 display:flex;flex-direction:column;align-items:center;gap:3px;
                 cursor:pointer;transition:all 0.15s;user-select:none;">
          <span style="font-size:14px;font-weight:800;letter-spacing:0.03em;">JPG</span>
        </div>
        <div id="fc-fmt-tif" class="fc-fmt-card" data-fmt="tif"
          style="padding:9px 6px;border-radius:10px;border:1.5px solid;
                 display:flex;flex-direction:column;align-items:center;gap:3px;
                 cursor:pointer;transition:all 0.15s;user-select:none;">
          <span style="font-size:14px;font-weight:800;letter-spacing:0.03em;">TIF</span>
        </div>
      </div>

      <!-- Folder -->
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#8e8e93;margin-bottom:7px;">Kayıt Klasörü</div>
      <div id="fc-folder-btn"
        style="display:flex;align-items:center;gap:8px;padding:9px 11px;
               background:#f2f2f7;border-radius:10px;cursor:pointer;
               border:1.5px solid #f2f2f7;transition:all 0.15s;user-select:none;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="#3a3a3c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span id="fc-folder-name" style="flex:1;font-size:11.5px;color:#3a3a3c;
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">
          Seçilmedi
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
             stroke="#c7c7cc" stroke-width="2.5" stroke-linecap="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
      <div id="fc-folder-hint" style="font-size:10px;color:#c7c7cc;margin-top:4px;padding-left:2px;">
        Tıkla ve klasör seç — bir kez yeter
      </div>

      <!-- Divider -->
      <div style="height:1px;background:#f2f2f7;margin:12px 0;"></div>

      <!-- Shortcut -->
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#8e8e93;margin-bottom:7px;">Kısayol</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div id="fc-kbd"
          style="flex:1;text-align:center;padding:8px;border-radius:9px;
                 background:#f2f2f7;border:1.5px solid #e5e5ea;
                 font-family:monospace;font-size:15px;font-weight:700;
                 color:#1c1c1e;letter-spacing:0.06em;">
          P
        </div>
        <button id="fc-rec-btn"
          style="padding:8px 12px;border:1.5px solid #e5e5ea;border-radius:9px;
                 background:#fff;color:#1c1c1e;font-family:inherit;font-size:11.5px;
                 font-weight:500;cursor:pointer;white-space:nowrap;outline:none;">
          Değiştir
        </button>
      </div>
      <div id="fc-rec-hint" style="font-size:10px;color:#c7c7cc;margin-top:5px;padding-left:2px;">P tuşuna bas → yakala</div>
    `;

    document.body.appendChild(p);

    // Animate in
    requestAnimationFrame(() => requestAnimationFrame(() => {
      p.style.opacity = '1';
      p.style.transform = 'translateY(0)';
    }));

    // ── Format cards ──
    const cards = p.querySelectorAll('.fc-fmt-card');

    function setActiveFormat(fmt) {
      cards.forEach(c => {
        const active = c.dataset.fmt === fmt;
        c.style.borderColor  = active ? '#007aff' : '#e5e5ea';
        c.style.background   = active ? '#f0f6ff' : '#fff';
        c.querySelector('span').style.color = active ? '#007aff' : '#3a3a3c';
      });
    }

    chrome.storage.local.get(['format'], (d) => {
      setActiveFormat(d.format || prefs.format);
    });

    cards.forEach(card => {
      card.addEventListener('mouseenter', () => { if (card.dataset.fmt !== prefs.format) card.style.background = '#f8f8f8'; });
      card.addEventListener('mouseleave', () => { if (card.dataset.fmt !== prefs.format) card.style.background = '#fff'; });
      card.addEventListener('click', () => {
        prefs.format = card.dataset.fmt;
        chrome.storage.local.set({ format: prefs.format });
        setActiveFormat(prefs.format);
      });
    });

    // ── Folder picker ──
    const folderBtn  = p.querySelector('#fc-folder-btn');
    const folderName = p.querySelector('#fc-folder-name');
    const folderHint = p.querySelector('#fc-folder-hint');

    // Load existing
    idbGet('dirName').then(name => {
      if (name) {
        folderName.textContent = name;
        folderHint.textContent = `"${name}" klasörüne kaydedilecek`;
      }
    });

    folderBtn.addEventListener('mouseenter', () => {
      folderBtn.style.background   = '#e9e9ef';
      folderBtn.style.borderColor  = '#d1d1d6';
    });
    folderBtn.addEventListener('mouseleave', () => {
      folderBtn.style.background  = '#f2f2f7';
      folderBtn.style.borderColor = '#f2f2f7';
    });

    folderBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      folderBtn.style.borderColor = '#007aff';
      folderName.textContent = 'Seçiliyor…';

      const handle = await pickFolder();
      if (handle) {
        folderName.textContent = handle.name;
        folderHint.textContent = `"${handle.name}" klasörüne kaydedilecek`;
        folderHint.style.color = '#34c759';
        setTimeout(() => { folderHint.style.color = '#c7c7cc'; }, 2000);
        folderBtn.style.borderColor = '#34c759';
        setTimeout(() => { folderBtn.style.borderColor = '#f2f2f7'; }, 1500);
      } else {
        const storedName = await idbGet('dirName');
        folderName.textContent = storedName || 'Seçilmedi';
        folderBtn.style.borderColor = '#f2f2f7';
      }
    });

    // ── Shortcut recorder ──
    const kbdEl   = p.querySelector('#fc-kbd');
    const recBtn  = p.querySelector('#fc-rec-btn');
    const recHint = p.querySelector('#fc-rec-hint');

    chrome.storage.local.get(['shortcutKey'], (d) => {
      const k = (d.shortcutKey || 'p').toUpperCase();
      kbdEl.textContent = k;
      recHint.textContent = k + ' tuşuna bas → yakala';
    });

    let recording = false;
    recBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      recording = !recording;
      if (recording) {
        kbdEl.textContent = '·';
        kbdEl.style.borderColor = '#007aff';
        kbdEl.style.color = '#007aff';
        recBtn.textContent = 'İptal';
        recHint.textContent = 'Herhangi bir tuşa bas…';
        recHint.style.color = '#007aff';
        p.setAttribute('tabindex', '-1');
        p.focus();
      } else {
        kbdEl.style.borderColor = '#e5e5ea';
        kbdEl.style.color = '#1c1c1e';
        kbdEl.textContent = prefs.shortcutKey.toUpperCase();
        recBtn.textContent = 'Değiştir';
        recHint.textContent = kbdEl.textContent + ' tuşuna bas → yakala';
        recHint.style.color = '#c7c7cc';
      }
    });

    document.addEventListener('keydown', function rec(e) {
      if (!recording) return;
      if (['Control','Shift','Alt','Meta','CapsLock','Tab'].includes(e.key)) return;
      if (e.key === 'Escape') { recBtn.click(); document.removeEventListener('keydown', rec); return; }
      e.preventDefault(); e.stopPropagation();
      recording = false;
      document.removeEventListener('keydown', rec);
      const k = e.key.toLowerCase();
      prefs.shortcutKey = k;
      chrome.storage.local.set({ shortcutKey: k });
      kbdEl.textContent = k.toUpperCase();
      kbdEl.style.borderColor = '#34c759';
      kbdEl.style.color = '#1c1c1e';
      recBtn.textContent = 'Değiştir';
      recHint.textContent = k.toUpperCase() + ' tuşuna bas → yakala';
      recHint.style.color = '#34c759';
      setTimeout(() => {
        kbdEl.style.borderColor = '#e5e5ea';
        recHint.style.color = '#c7c7cc';
      }, 1500);
    }, true);

    // Close
    p.querySelector('#fc-close').addEventListener('click', (e) => { e.stopPropagation(); p.remove(); });

    setTimeout(() => {
      document.addEventListener('click', function outside(e) {
        if (!p.contains(e.target) && e.target.id !== 'yt-fc-settings-btn') {
          p.remove();
          document.removeEventListener('click', outside);
        }
      });
    }, 200);
  }

  // ── Player buttons ─────────────────────────────────────────────────────────
  function injectButtons() {
    if (document.getElementById('yt-fc-btn')) return;
    const controls = document.querySelector('.ytp-right-controls');
    if (!controls) return;

    controls.insertBefore(
      makeBtn('yt-fc-settings-btn', 'Frame Catcher — Ayarlar',
        `<svg viewBox="0 0 24 24" width="20" height="20" fill="white" style="opacity:0.78">
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61
                   l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54
                   c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54
                   c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87
                   c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94
                   l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96
                   c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41
                   l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32
                   c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6
                   3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
        </svg>`,
        () => toggleSettingsPanel()
      ),
      controls.firstChild
    );

    controls.insertBefore(
      makeBtn('yt-fc-btn', 'Frame Catcher — Yakala',
        `<svg viewBox="0 0 36 36" width="100%" height="100%" fill="white">
          <path d="M27,11L24.5,11L23,8.5C22.7,8,22.1,7.7,21.5,7.7L14.5,7.7
                   C13.9,7.7,13.3,8,13,8.5L11.5,11L9,11C7.3,11,6,12.3,6,14L6,24
                   C6,25.7,7.3,27,9,27L27,27C28.7,27,30,25.7,30,24L30,14
                   C30,12.3,28.7,11,27,11Z M18,24C15.2,24,13,21.8,13,19
                   C13,16.2,15.2,14,18,14C20.8,14,23,16.2,23,19C23,21.8,20.8,24,18,24Z"/>
          <circle cx="18" cy="19" r="2.5"/>
        </svg>`,
        () => captureFrame()
      ),
      controls.firstChild
    );
  }

  function makeBtn(id, title, svg, onClick) {
    const b = document.createElement('button');
    b.id = id; b.title = title; b.className = 'ytp-button';
    b.innerHTML = svg;
    b.style.cssText = 'width:36px;height:36px;opacity:0.9;cursor:pointer;background:none;border:none;padding:0;display:inline-flex;align-items:center;justify-content:center;transition:opacity .2s,transform .15s;';
    b.addEventListener('mouseenter', () => { b.style.opacity = '1';   b.style.transform = 'scale(1.1)'; });
    b.addEventListener('mouseleave', () => { b.style.opacity = '0.9'; b.style.transform = 'scale(1)'; });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      b.style.transform = 'scale(0.88)';
      setTimeout(() => { b.style.transform = 'scale(1)'; }, 140);
      onClick();
    });
    return b;
  }

  // ── Keyboard shortcut ──────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;
    if (document.getElementById('yt-fc-panel')) return;

    if (e.key.toLowerCase() === prefs.shortcutKey) {
      const v = document.querySelector('video');
      if (v && v.videoWidth) { e.preventDefault(); captureFrame(); }
    }
  }, true);

  // ── Observer + SPA ─────────────────────────────────────────────────────────
  new MutationObserver(() => injectButtons())
    .observe(document.body, { childList: true, subtree: true });

  let lastUrl = location.href;
  function onNav() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    ['yt-fc-btn', 'yt-fc-settings-btn', 'yt-fc-panel'].forEach(id => document.getElementById(id)?.remove());
    setTimeout(injectButtons, 1200);
  }
  const _ps = history.pushState.bind(history);
  const _rs = history.replaceState.bind(history);
  history.pushState    = (...a) => { _ps(...a); onNav(); };
  history.replaceState = (...a) => { _rs(...a); onNav(); };
  window.addEventListener('popstate', onNav);

  injectButtons();
})();
