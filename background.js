/**
 * background.js — Frame Catcher Service Worker
 *
 * Handles chrome.downloads calls (not accessible from content scripts).
 * Receives download requests from content.js via runtime messaging.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'download') return;

  const { dataUrl, folder, filename } = message;

  // Build path relative to the Downloads directory
  const cleanFolder = (folder || 'YouTube Frames')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  const fullPath = `${cleanFolder}/${filename}`;

  chrome.downloads.download(
    {
      url:            dataUrl,
      filename:       fullPath,
      saveAs:         false,
      conflictAction: 'uniquify',
    },
    (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    }
  );

  return true; // keep message channel open for async response
});
