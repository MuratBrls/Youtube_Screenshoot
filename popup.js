/**
 * popup.js — Frame Catcher Settings Logic  v2.0
 * White/iOS-style design matching the in-page settings panel
 */

(function () {
  'use strict';

  // ── Element refs ─────────────────────────────────────────────────────────
  const formatRadios   = document.querySelectorAll('input[name="format"]');
  const qualityWrap    = document.getElementById('quality-wrap');
  const qualitySlider  = document.getElementById('jpg-quality');
  const qDisplay       = document.getElementById('q-display');

  const folderBtn      = document.getElementById('folder-btn');
  const folderName     = document.getElementById('folder-name');
  const folderHint     = document.getElementById('folder-hint');

  const kbdBox         = document.getElementById('kbd-box');
  const recBtn         = document.getElementById('rec-btn');
  const shortcutHint   = document.getElementById('shortcut-hint');

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
  chrome.storage.local.get(['format', 'jpgQuality', 'shortcutKey', 'savedFolderName'], (d) => {
    const fmt     = d.format          || 'jpg';
    const quality = d.jpgQuality      || 95;
    const key     = (d.shortcutKey    || 'p').toUpperCase();
    const folder  = d.savedFolderName || null;

    // Format
    const radio = document.querySelector(`input[name="format"][value="${fmt}"]`);
    if (radio) radio.checked = true;
    toggleQuality(fmt);

    // Quality slider
    qualitySlider.value = quality;
    qDisplay.textContent = quality;
    updateSlider(quality);

    // Folder
    if (folder) {
      folderName.textContent = folder;
      folderHint.textContent = `Will save to "${folder}"`;
    }

    // Shortcut
    kbdBox.textContent = key;
    shortcutHint.textContent = `Press ${key} → capture`;
  });

  // ── YouTube tab status ────────────────────────────────────────────────────
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    const isWatch = url.includes('youtube.com/watch');
    statusEls.forEach(({ banner, msg }) => {
      if (isWatch) {
        banner.classList.add('ready');
        msg.textContent = 'YouTube video detected — ready!';
      } else {
        msg.textContent = 'Navigate to a YouTube video page.';
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

  // ── Folder button (opens a new tab to YouTube for FSA picker) ─────────────
  folderBtn.addEventListener('click', async () => {
    // Popup context doesn't support showDirectoryPicker directly.
    // Send message to active YouTube tab to trigger folder picker there.
    const tabs = await new Promise(res =>
      chrome.tabs.query({ active: true, currentWindow: true }, res)
    );
    const tab = tabs[0];
    if (tab && tab.url && tab.url.includes('youtube.com')) {
      chrome.tabs.sendMessage(tab.id, { action: 'pickFolder' }, (resp) => {
        if (chrome.runtime.lastError) return;
        if (resp && resp.folderName) {
          folderName.textContent = resp.folderName;
          folderHint.textContent = `Will save to "${resp.folderName}"`;
          folderHint.style.color = '#34c759';
          folderBtn.style.borderColor = '#34c759';
          setTimeout(() => {
            folderHint.style.color = '';
            folderBtn.style.borderColor = '';
          }, 2000);
        }
      });
    } else {
      // Load saved folder name from storage
      chrome.storage.local.get(['savedFolderName'], (d) => {
        if (d.savedFolderName) {
          folderName.textContent = d.savedFolderName;
          folderHint.textContent = `Will save to "${d.savedFolderName}"`;
        } else {
          folderHint.textContent = 'Open a YouTube video page first';
          folderHint.style.color = '#ff3b30';
          setTimeout(() => {
            folderHint.textContent = 'Click to choose folder — once is enough';
            folderHint.style.color = '';
          }, 2500);
        }
      });
    }
  });

  // ── Keyboard shortcut recorder ────────────────────────────────────────────
  let recording = false;

  recBtn.addEventListener('click', () => {
    if (!recording) {
      recording = true;
      kbdBox.textContent = '·';
      kbdBox.classList.add('recording');
      recBtn.textContent = 'Cancel';
      shortcutHint.textContent = 'Press any key…';
      shortcutHint.style.color = '#007aff';
    } else {
      cancelRecording();
    }
  });

  function cancelRecording() {
    recording = false;
    kbdBox.classList.remove('recording');
    recBtn.textContent = 'Change';
    shortcutHint.style.color = '';
    chrome.storage.local.get(['shortcutKey'], (d) => {
      const k = (d.shortcutKey || 'p').toUpperCase();
      kbdBox.textContent = k;
      shortcutHint.textContent = `Press ${k} → capture`;
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!recording) return;
    if (['Control','Shift','Alt','Meta','CapsLock','Tab'].includes(e.key)) return;
    if (e.key === 'Escape') { cancelRecording(); return; }

    e.preventDefault();

    const key = e.key.toLowerCase();
    kbdBox.textContent = key.toUpperCase();
    kbdBox.classList.remove('recording');
    kbdBox.style.borderColor = '#34c759';
    kbdBox.style.color = '#34c759';
    recBtn.textContent = 'Change';
    recording = false;

    shortcutHint.textContent = `Press ${key.toUpperCase()} → capture`;
    shortcutHint.style.color = '#34c759';

    setTimeout(() => {
      kbdBox.style.borderColor = '';
      kbdBox.style.color = '';
      shortcutHint.style.color = '';
    }, 1500);

    chrome.storage.local.set({ shortcutKey: key });
  });

  // ── Save button ───────────────────────────────────────────────────────────
  saveBtn.addEventListener('click', () => {
    const fmt     = document.querySelector('input[name="format"]:checked')?.value || 'jpg';
    const quality = parseInt(qualitySlider.value, 10);
    const key     = kbdBox.textContent.toLowerCase();

    chrome.storage.local.set(
      { format: fmt, jpgQuality: quality, shortcutKey: key },
      () => {
        saveBtn.textContent = '✓ Saved!';
        saveBtn.classList.add('ok');
        setTimeout(() => {
          saveBtn.textContent = 'Save & Apply';
          saveBtn.classList.remove('ok');
        }, 1800);
      }
    );
  });

})();
