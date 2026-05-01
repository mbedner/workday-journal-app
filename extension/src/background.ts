// Background Service Worker — Manifest V3
// Handles context menu registration and passes selected text to the popup.

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'wj-add-task',
    title: 'Add to Workday Journal',
    contexts: ['selection', 'page'],
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'wj-add-task') return

  // Store selected text + page context so the popup can read it on open
  await chrome.storage.local.set({
    pendingCapture: {
      selectedText: info.selectionText ?? '',
      pageUrl: info.pageUrl ?? tab?.url ?? '',
      pageTitle: tab?.title ?? '',
      timestamp: Date.now(),
    },
  })

  // In Chrome 127+, chrome.action.openPopup() works in some contexts.
  // We just store the data above; the popup reads it when the user clicks the extension icon.
  // Optionally show a badge so the user knows to click the extension icon.
  chrome.action.setBadgeText({ text: '1' })
  chrome.action.setBadgeBackgroundColor({ color: '#4f46e5' })
})

// Clear badge when popup opens
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    chrome.action.setBadgeText({ text: '' })
  }
})
