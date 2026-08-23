// background.js
// Registers a right-click context menu item that appears whenever the user
// has text selected on a page. Clicking it stashes the selection so the
// popup can pick it up as priority context when it opens.

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "pagesense-ask-selection",
    title: 'Ask PageSense about "%s"',
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "pagesense-ask-selection") return;
  if (!info.selectionText) return;

  // Save the selection + which tab it came from, so popup.js can read it
  // the moment the popup opens.
  await chrome.storage.local.set({
    pendingSelection: {
      text: info.selectionText,
      tabId: tab.id,
      timestamp: Date.now()
    }
  });

  // Try to open the popup automatically. This only works on Chrome 99+ and
  // must be called synchronously-ish from a user gesture (the menu click
  // itself counts). If it's unsupported, the user just clicks the toolbar
  // icon and the selection will still be waiting for them.
  if (chrome.action.openPopup) {
    try {
      await chrome.action.openPopup();
    } catch (e) {
      // Popup couldn't be auto-opened (older Chrome, or focus restriction).
      // The selection is still saved in storage, so nothing is lost.
      console.log("PageSense: couldn't auto-open popup, selection saved for next open.", e);
    }
  }
});
