// background.js — service worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('[SurveyAI] Extension installed.');
});

// Listen for messages from the popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // 1. Your original Relay Logic
  if (request.action === 'relayToTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, request.payload, sendResponse);
      } else {
        sendResponse({ error: "No active tab found" });
      }
    });
    return true; // keep channel open
  }

  // 2. The NEW Fetch Logic to bypass CORS blocks
  if (request.action === 'fetchAPI') {
    fetch(request.url, request.options)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok, status: res.status, data });
      })
      .catch((err) => {
        sendResponse({ error: err.message });
      });
      
    // CRITICAL: This tells Chrome we will send the response asynchronously.
    // Prevents the "message port closed" error!
    return true; 
  }
});