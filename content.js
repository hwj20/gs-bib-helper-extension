// content.js
// On the Google Scholar search results page, inject a "CopyBib" button for each result;
// and inject a "Get First BibTeX" button next to the search box to automatically fetch the BibTeX of the first result


(() => {
  const observerConfig = { childList: true, subtree: true };

 // —— Non-blocking toast ——
  function showToast(msg) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 10px 15px;
      background: rgba(0,0,0,0.7);
      color: #fff;
      border-radius: 4px;
      font-size: 14px;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.style.opacity = '1');
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
async function appendToClipboard(newText) {
  if (navigator.clipboard?.readText && navigator.clipboard?.writeText) {
    try {
      const oldText = await navigator.clipboard.readText();
      const combined = oldText + '\n' + newText;   
      await navigator.clipboard.writeText(combined);
      return;
    } catch (err) {
      console.warn('Clipboard API error, fallback:', err);
    }
  }
  const ta = document.createElement('textarea');
  document.body.appendChild(ta);
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  ta.focus();
  document.execCommand('paste');
  const oldText = ta.value;
  ta.value = oldText + '\n' + newText;
  ta.select();
  document.execCommand('copy');
  ta.remove();
}


  // Copy text to clipboard (fallback)
  function copyWithTextarea(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); }
    catch (e) { console.error('execCommand failed', e); }
    ta.remove();
  }

 // Close the Scholar "Cite" popup
  function closePopup() {
    const cancelBtn = document.querySelector('#gs_cit-x');
    if (cancelBtn) cancelBtn.click();
    // ['#gs_cit','#gs_md_cit-overlay','.gs_md_dock_wrapper','.gs_citr','.gs_ocd_citr']
    //   .forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));
  }

  // Simulate clicking citeLink without navigation
  function triggerCite(link) {
    const orig = link.getAttribute('href');
    link.removeAttribute('href');
    const prevent = e => e.preventDefault();
    link.addEventListener('click', prevent, true);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    link.removeEventListener('click', prevent, true);
    if (orig !== null) link.setAttribute('href', orig);
  }

  // —— Modification: let waitForBibtexUrl accept a doc parameter ——
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
        reject(new Error('Timeout while waiting for BibTeX link'));
      }
    });
    mo.observe(doc.body, { childList: true, subtree: true });
  });
}


  // Inject "BibTeX" button for each result
  function injectButtons() {
    document.querySelectorAll('.gs_ri').forEach(item => {
      if (item.dataset.bibBtnAdded) return;
      const citeLink = item.querySelector('.gs_or_cit');
      if (!citeLink) return;
      item.dataset.bibBtnAdded = '1';

      const btn = document.createElement('button');
      btn.innerHTML = '<span style="margin-right:4px;">📋</span>BibTeX';
      btn.title = 'Copy BibTeX';
      btn.style.cssText = [
        'margin-left:8px','margin-right:8px','padding:4px 8px',
        'font-size:12px','line-height:16px','display:inline-block',
        'vertical-align:middle','cursor:pointer','border:none',
        'border-radius:4px','background-color:#4285F4','color:#fff',
        'font-weight:500','box-shadow:0 1px 3px rgba(0,0,0,0.2)',
        'transition:background-color 0.2s'
      ].join(';');
      btn.addEventListener('mouseover', () => btn.style.backgroundColor = '#3367D6');
      btn.addEventListener('mouseout',  () => btn.style.backgroundColor = '#4285F4');

      btn.addEventListener('click', async e => {
        e.stopPropagation();
        let hideStyle = document.getElementById('hidePopup');
        if (!hideStyle) {
          hideStyle = document.createElement('style');
          hideStyle.id = 'hidePopup';
          hideStyle.textContent = `
            #gs_cit,#gs_md_cit-overlay,
            .gs_md_dock_wrapper,.gs_citr,.gs_ocd_citr {
              display: none !important;
            }
          `;
          document.head.appendChild(hideStyle);
        }

        try {
          triggerCite(citeLink);
          const url = await waitForBibtexUrl(document);
          closePopup();
          chrome.runtime.sendMessage({ action: 'fetchBib',url: url }, res => {
            if (res.error) {
              showToast('❌ Copy failed: ' + res.error);
              return;
            }
            const bib = res.bib;
            const finish = () => {
             window.location.replace(window.location.href);
              copyWithTextarea(bib);
              showToast('✔️ BibTeX copied');
            };
            if (navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(bib).then(finish).catch(finish);
            } else finish();
          });
        } catch (err) {
          document.getElementById('hidePopup')?.remove();
          closePopup();
          console.error(err);
          showToast('❌ Operation failed:' + err.message);
        }
        finally{
            hideStyle.remove();
        }
      });

      citeLink.parentNode.insertBefore(btn, citeLink.nextSibling);
    });
  }

  // —— Modification: fetchFirstBib accepts keyword q and opens new window to get document ——
  async function fetchFirstBib(q) {
    try {
      if (!q) throw new Error('No search keyword provided');
      const url = `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`;
      // New window
      const win = window.open(url, '_blank');
      if (!win) throw new Error('Unable to open new window');
      await new Promise(resolve => {
        win.addEventListener('load', () => resolve(), { once: true });
      });
    
  const onMessage = async e => {
    if (e.data?.type !== 'MY_EXT_BIB_URL') return;

    window.removeEventListener('message', onMessage);

    const bibUrl = e.data.url;
    if (!bibUrl) {
      showToast('❌ Failed to get BibTeX URL');
      return;
    }

    win.close();
    console.log(bibUrl);

    chrome.runtime.sendMessage({ action: 'fetchBib', url: bibUrl }, res => {
      if (res.error) {
        showToast('❌ Copy failed: ' + res.error);
        return;
      }
      const bib = res.bib;
      appendToClipboard(bib);
      showToast('✔️ BibTeX copied');
    });

  };

  window.addEventListener('message', onMessage);

    const script = win.document.createElement('script');
    script.src = chrome.runtime.getURL('triggerCite.js');
    win.document.head.appendChild(script);
    
    } catch (e) {
      console.error(e);
      showToast('❌ ' + e.message);
    }
  }

function injectGlobalButton() {
  const form = document.getElementById('gs_hdr_frm');
  if (!form || document.getElementById('firstBibGlobalBtn')) return;

   // Set form to inline-flex for horizontal alignment
  form.style.display = 'inline-flex';
  form.style.alignItems = 'center';

 // Find all submit elements, take the last one (usually the blue magnifying glass)
  const submits = form.querySelectorAll('button[type="submit"], input[type="submit"]');
  if (!submits.length) return;
  const searchBtn = submits[submits.length - 1];

  const btn = document.createElement('button');
  btn.id = 'firstBibGlobalBtn';
  btn.type = 'button';
  btn.textContent = 'BibTeX';
  btn.style.cssText = `
    margin-left:6px;
    margin-right:6px;
    padding:6px 12px;
    font-size:14px;
    cursor:pointer;
    border:none;
    border-radius:4px;
    background-color:#34A853;
    color:#fff;
  `;

   // Insert the green button after the blue search button
  searchBtn.insertAdjacentElement('afterend', btn);

  btn.addEventListener('click', () => {
    const q = form.querySelector('input[name="q"]')?.value.trim();
    if (!q) return showToast('Please enter search keyword');
    const finish = () => {
        copyWithTextarea("");
    };
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText("").then(finish).catch(finish);
    } else finish();

    fetchFirstBib(q);
  });
  // Right-click: batch mode
  btn.addEventListener('contextmenu', e => {
    e.preventDefault();

      // 1. Create overlay
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', top:0, left:0, right:0, bottom:0,
      background: 'rgba(0,0,0,0.5)', display:'flex',
      alignItems:'center', justifyContent:'center', zIndex:10000
    });

   // 2. Create dialog
    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
      background:'#fff', padding:'20px', borderRadius:'8px',
      width:'400px', maxWidth:'90%', boxSizing:'border-box'
    });

    const ta = document.createElement('textarea');
    Object.assign(ta.style, {
      width:'100%', height:'150px', boxSizing:'border-box',
      marginBottom:'10px', fontSize:'14px'
    });
    ta.placeholder = 'One title per line, separated by line breaks';

    const go = document.createElement('button');
    go.textContent = 'Batch retrieval';
    Object.assign(go.style, {
      padding:'8px 8px', cursor:'pointer',
      background:'#4285F4', color:'#fff', border:'none',
      borderRadius:'4px'
    });

    // 3 Batch retrieval
    go.addEventListener('click', () => {
      const lines = ta.value
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
      if (lines.length === 0) {
        showToast('Please enter at least one title');
        return;
      }
        const finish = () => {
            copyWithTextarea("");
        };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText("").then(finish).catch(finish);
        } else finish();

    // Call fetchFirstBib one by one, 2s interval (prevent too many windows at once)
      lines.forEach((title, i) => {
        setTimeout(() => fetchFirstBib(title), i * 2000);
      });
      document.body.removeChild(overlay);
      showToast(`已开始批量处理 ${lines.length} 条`);
    });

    // 4. Cancel dialog by clicking blank area of overlay
    overlay.addEventListener('click', ev => {
      if (ev.target === overlay) document.body.removeChild(overlay);
    });

    dialog.appendChild(ta);
    dialog.appendChild(go);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  });


}

  new MutationObserver(injectGlobalButton).observe(document.body, observerConfig);
  new MutationObserver(injectButtons).observe(document.body, observerConfig);
  
  injectGlobalButton();
  injectButtons();
})();
