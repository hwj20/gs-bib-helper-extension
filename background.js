chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'fetchBib') {
    fetch(msg.url, {
      credentials: 'include'
    })
    .then(r => {
      if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
      return r.text();
    })
    .then(text => sendResponse({ bib: text }))
    .catch(err => sendResponse({ error: err.message }));
    return true;  // 保持 sendResponse 异步调用
  }
});
