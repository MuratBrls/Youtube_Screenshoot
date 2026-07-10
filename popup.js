/**
 * popup.js — Frame Catcher Settings Logic  v1.1
 * Tabs: Format | Ayarlar (folder + keyboard shortcut)
 */

(function () {
  'use strict';

  // ── Element refs ─────────────────────────────────────────────────────────
  const formatRadios   = document.querySelectorAll('input[name="format"]');
  const qualityWrap    = document.getElementById('quality-wrap');
  const qualitySlider  = document.getElementById('jpg-quality');
  const qDisplay       = document.getElementById('q-display');

  const folderInput    = document.getElementById('save-folder');
  const folderPreview  = document.getElementById('folder-preview');

  const shortcutBox    = document.getElementById('shortcut-box');
  const shortcutLabel  = document.getElementById('shortcut-label');
  const kbdKey         = document.getElementById('kbd-key');
  const recBtn         = document.getElementById('rec-btn');

  const saveBtn        = document.getElementById('save-btn');
  const statusEls      = [
    { banner: document.getElementById('status'),  msg: document.getElementById('status-msg')  },
    { banner: document.getElementById('status2'), msg: document.getElementById('status-msg2') },
  ];

  // ── Tabs ─────────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ── Load saved settings ───────────────────────────────────────────────────
  chrome.storage.local.get(['format', 'jpgQuality', 'saveFolder', 'shortcutKey'], (d) => {
    const fmt     = d.format      || 'tif';
    const quality = d.jpgQuality  || 95;
    const folder  = d.saveFolder  || 'YouTube Frames';
    const key     = (d.shortcutKey || 'p').toUpperCase();

    // Format
    const radio = document.querySelector(`input[name="format"][value="${fmt}"]`);
    if (radio) radio.checked = true;
    toggleQuality(fmt);

    // Quality slider
    qualitySlider.value = quality;
    qDisplay.textContent = quality;
    updateSlider(quality);

    // Folder
    folderInput.value    = folder;
    folderPreview.textContent = folder || 'YouTube Frames';

    // Shortcut
    kbdKey.textContent = key;
  });

  // ── YouTube tab status ────────────────────────────────────────────────────
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    const isWatch = url.includes('youtube.com/watch');
    statusEls.forEach(({ banner, msg }) => {
      if (isWatch) {
        banner.classList.add('ready');
        msg.textContent = 'YouTube videosu algılandı — hazır!';
      } else {
        msg.textContent = 'YouTube video sayfasına git.';
      }
    });
  });

  // ── Format radios ─────────────────────────────────────────────────────────
  formatRadios.forEach((r) => r.addEventListener('change', () => toggleQuality(r.value)));

  function toggleQuality(fmt) {
    if (fmt === 'jpg') qualityWrap.classList.add('show');
    else               qualityWrap.classList.remove('show');
  }

  // ── Quality slider ────────────────────────────────────────────────────────
  qualitySlider.addEventListener('input', () => {
    qDisplay.textContent = qualitySlider.value;
    updateSlider(qualitySlider.value);
  });

  function updateSlider(val) {
    const pct = ((val - 60) / 40) * 100;
    qualitySlider.style.setProperty('--pct', pct + '%');
  }

  // ── Folder input ──────────────────────────────────────────────────────────
  folderInput.addEventListener('input', () => {
    folderPreview.textContent = folderInput.value.trim() || 'YouTube Frames';
  });

  // ── Keyboard shortcut recorder ────────────────────────────────────────────
  let recording = false;

  recBtn.addEventListener('click', () => {
    if (recording) return;
    recording = true;
    shortcutBox.classList.add('recording');
    shortcutLabel.textContent = 'Bir tuşa bas…';
    kbdKey.textContent = '?';
    recBtn.textContent = 'İptal';

    recBtn.addEventListener('click', cancelRecording, { once: true });
  });

  function cancelRecording() {
    recording = false;
    shortcutBox.classList.remove('recording');
    shortcutLabel.textContent = 'Aktif kısayol';
    recBtn.textContent = 'Değiştir';
    // Restore current saved key
    chrome.storage.local.get(['shortcutKey'], (d) => {
      kbdKey.textContent = (d.shortcutKey || 'p').toUpperCase();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!recording) return;

    // Ignore modifier-only keys
    if (['Control','Shift','Alt','Meta','CapsLock','Tab','Escape'].includes(e.key)) {
      if (e.key === 'Escape') cancelRecording();
      return;
    }

    e.preventDefault();

    const key = e.key.toLowerCase();
    kbdKey.textContent = key.toUpperCase();
    shortcutLabel.textContent = 'Aktif kısayol';
    shortcutBox.classList.remove('recording');
    recBtn.textContent = 'Değiştir';
    recording = false;

    // Save immediately
    chrome.storage.local.set({ shortcutKey: key });
  });

  // ── Save button ───────────────────────────────────────────────────────────
  saveBtn.addEventListener('click', () => {
    const fmt     = document.querySelector('input[name="format"]:checked')?.value || 'tif';
    const quality = parseInt(qualitySlider.value, 10);
    const folder  = folderInput.value.trim() || 'YouTube Frames';
    const key     = kbdKey.textContent.toLowerCase();

    chrome.storage.local.set(
      { format: fmt, jpgQuality: quality, saveFolder: folder, shortcutKey: key },
      () => {
        saveBtn.textContent = '✓ Kaydedildi!';
        saveBtn.classList.add('ok');
        setTimeout(() => {
          saveBtn.textContent = 'Kaydet & Uygula';
          saveBtn.classList.remove('ok');
        }, 1800);
      }
    );
  });

})();
