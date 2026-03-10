console.log("content.js laddad på", location.href);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyze") {
    const text = document.body?.innerText || "";
    sendResponse({ pageText: text.slice(0, 12000) });
  }
  return true;
});
