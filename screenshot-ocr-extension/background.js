/**
 * Background Service Worker
 * 负责 captureVisibleTab + 获取标签页信息
 */
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'capture') {
    handleCapture()
      .then(function(result) { sendResponse(result); })
      .catch(function(err) { sendResponse({ error: err.message }); });
    return true; // 保持通道开放
  }
});

async function handleCapture() {
  // 获取当前窗口截图
  var wins = await chrome.windows.getLastFocused();
  var dataUrl = await chrome.tabs.captureVisibleTab(wins.id, { format: 'png' });

  // 获取标签页信息
  var tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  var tab = tabs[0] || {};

  return {
    dataUrl: dataUrl,
    url: tab.url || '',
    title: tab.title || ''
  };
}
