// Content script — runs on every page.
// Captures the active selection into storage before the popup opens,
// since focus shifts away from the page the moment the extension icon is clicked.

const store = () => {
  const sel = window.getSelection()?.toString().trim() ?? ''
  chrome.storage.local.set({ pageSelection: sel })
}

document.addEventListener('selectionchange', store)
document.addEventListener('mouseup', store)
