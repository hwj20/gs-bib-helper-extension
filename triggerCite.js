// triggerCite.js
 function triggerCite(link) {
    const orig = link.getAttribute('href');
    link.removeAttribute('href');
    const prevent = e => e.preventDefault();
    link.addEventListener('click', prevent, true);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    link.removeEventListener('click', prevent, true);
    if (orig !== null) link.setAttribute('href', orig);
  }
function waitForBibtexUrl(doc, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const mo = new MutationObserver(() => {
      const a = Array.from(doc.querySelectorAll('a'))
        .find(x => /bibtex/i.test(x.textContent) && /\.bib(\?|$)/.test(x.href));
      if (a) {
        mo.disconnect();
        let u = a.href;
        if (u.startsWith('//')) u = 'https:' + u;
        else if (u.startsWith('/')) u = 'https://scholar.google.com' + u;
        resolve(u);
      } else if (Date.now() - start > timeout) {
        mo.disconnect();
        reject(new Error('等待 BibTeX 链接超时'));
      }
    });
    mo.observe(doc.body, { childList: true, subtree: true });
  });
}

 async function returnBibURL() {
  console.log("injected");
  const link = document.querySelector('.gs_or_cit');
  console.log(link);
  if (!link) return;
     try {
          triggerCite(link);
          const url = await waitForBibtexUrl(document);
          console.log(url);
          return url
        } catch (err) {
          console.error(err);
        }
        finally{
        }
   return "Not Valid Url"
};


// 立即执行并 postMessage 给 content script
;(async()=>{
  const url = await returnBibURL();
    // 发给原窗口
  if (window.opener) {
    window.opener.postMessage({ type: 'MY_EXT_BIB_URL', url }, '*');
  }
})();