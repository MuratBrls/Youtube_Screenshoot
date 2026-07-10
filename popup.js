/**
 * popup.js — Frame Catcher Settings UI Logic
 * Handles format selection, JPG quality, and chrome.storage persistence.
 */

(function () {
  'use strict';

  const formatRadios   = document.querySelectorAll('input[name="format"]');
  const qualitySection = document.getElementById('quality-section');
  const qualitySlider  = document.getElementById('jpg-quality');
  const qualityDisplay = document.getElementById('quality-display');
  const saveBtn        = document.getElementById('save-btn');
  const statusBanner   = document.getElementById('status-banner');
  const statusText     = document.getElementById('status-text');

  // ── Load saved settings ──────────────────────────────────────────────────
  chrome.storage.local.get(['format', 'jpgQuality'], (data) => {
    const savedFormat  = data.format     || 'tif';
    const savedQuality = data.jpgQuality || 95;

    // Set radio
    const radio = document.querySelector(`input[name="format"][value="${savedFormat}"]`);
    if (radio) radio.checked = true;

    // Set slider
    qualitySlider.value = savedQuality;
    qualityDisplay.textContent = savedQuality;
    updateSliderBackground(savedQuality);

    // Show/hide quality section
    toggleQualitySection(savedFormat);
  });

  // ── Check if we're on YouTube ────────────────────────────────────────────
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    if (url.includes('youtube.com/watch')) {
      statusBanner.classList.add('ready');
      statusText.textContent = 'YouTube videosu algılandı — hazır!';
    } else {
      statusText.textContent = 'YouTube video sayfasına git.';
    }
  });

  // ── Format radio change ──────────────────────────────────────────────────
  formatRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      toggleQualitySection(radio.value);
    });
  });

  function toggleQualitySection(format) {
    if (format === 'jpg') {
      qualitySection.classList.remove('hidden');
      qualitySection.classList.add('visible');
    } else {
      qualitySection.classList.remove('visible');
      qualitySection.classList.add('hidden');
    }
  }

  // ── Quality slider ───────────────────────────────────────────────────────
  qualitySlider.addEventListener('input', () => {
    const val = qualitySlider.value;
    qualityDisplay.textContent = val;
    updateSliderBackground(val);
  });

  function updateSliderBackground(val) {
    const pct = ((val - 60) / (100 - 60)) * 100;
    qualitySlider.style.setProperty('--val', pct + '%');
    qualitySlider.style.background = `linear-gradient(to right, #ff0000 0%, #ff0000 ${pct}%, #2a2a2a ${pct}%)`;
  }

  // ── Save button ──────────────────────────────────────────────────────────
  saveBtn.addEventListener('click', () => {
    const selectedFormat = document.querySelector('input[name="format"]:checked')?.value || 'tif';
    const selectedQuality = parseInt(qualitySlider.value, 10);

    chrome.storage.local.set({ format: selectedFormat, jpgQuality: selectedQuality }, () => {
      // Visual feedback
      saveBtn.textContent = '✓ Kaydedildi!';
      saveBtn.classList.add('saved');

      setTimeout(() => {
        saveBtn.textContent = 'Kaydet & Uygula';
        saveBtn.classList.remove('saved');
      }, 1800);
    });
  });

})();
