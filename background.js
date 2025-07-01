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

// background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'fetchFirstFromScholar') {
    (async () => {
      // 这儿的 fetch 拿回来的，不是当前页 DOM，而是一个 HTML 字符串
      const html = await (await fetch(
        'https://scholar.google.com/scholar?q=' + encodeURIComponent(msg.query)
      )).text();

      // 用 DOMParser 造一个“虚拟 Document”
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // 然后再在这个虚拟 doc 上找第一个 .gs_ri、.gs_or_cit、bibtex link……
      const first = doc.querySelector('.gs_ri');
      // …提取 bib 链接并 fetch、sendResponse({ bib })…

    })();
    return true;
  }
});
