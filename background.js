chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

// Open X search tabs — must run in the service worker (MV3)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "OPEN_X_SEARCH") return false;

  const urls = Array.isArray(msg.urls) ? msg.urls.filter(Boolean) : [];
  if (!urls.length) {
    sendResponse({ ok: false, error: "no urls" });
    return true;
  }

  let opened = 0;
  let i = 0;

  const openNext = () => {
    if (i >= urls.length) {
      sendResponse({ ok: opened > 0, opened });
      return;
    }
    const url = urls[i++];
    try {
      chrome.tabs.create({ url, active: i === 1 }, () => {
        if (!chrome.runtime.lastError) opened += 1;
        openNext();
      });
    } catch (e) {
      openNext();
    }
  };

  openNext();
  return true; // keep channel open for async sendResponse
});
