// content.js
// 在谷歌学术搜索结果页，为每个结果注入 “CopyBib” 按钮；
// 并在搜索框旁注入 “Get First BibTeX” 按钮，自动抓取第一个结果的 BibTeX

(() => {
  const observerConfig = { childList: true, subtree: true };

  // —— 非阻塞 toast —— 
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
  // 先试现代剪贴板 API
  if (navigator.clipboard?.readText && navigator.clipboard?.writeText) {
    try {
      // 直接在 click 处理器里调用，确保是用户手势
      const oldText = await navigator.clipboard.readText();
      const combined = oldText + '\n' + newText;   // 在两者之间加换行
      await navigator.clipboard.writeText(combined);
      return;
    } catch (err) {
      console.warn('Clipboard API 读写失败，切换到 fallback:', err);
    }
  }
  // Fallback：用 textarea + execCommand
  const ta = document.createElement('textarea');
  document.body.appendChild(ta);
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  ta.focus();
  // 尝试把系统剪贴板粘贴进 textarea
  document.execCommand('paste');
  const oldText = ta.value;
  ta.value = oldText + '\n' + newText;
  ta.select();
  document.execCommand('copy');
  ta.remove();
}


  // 复制文本到剪贴板（fallback）
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

  // 关闭 Scholar “引用” 弹层
  function closePopup() {
    const cancelBtn = document.querySelector('#gs_cit-x');
    if (cancelBtn) cancelBtn.click();
    // ['#gs_cit','#gs_md_cit-overlay','.gs_md_dock_wrapper','.gs_citr','.gs_ocd_citr']
    //   .forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));
  }

  // 模拟点击 citeLink，不导航
  function triggerCite(link) {
    const orig = link.getAttribute('href');
    link.removeAttribute('href');
    const prevent = e => e.preventDefault();
    link.addEventListener('click', prevent, true);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    link.removeEventListener('click', prevent, true);
    if (orig !== null) link.setAttribute('href', orig);
  }

// —— 修改：让 waitForBibtexUrl 接收一个 doc 参数 —— 
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


  // 为每条结果注入“BibTeX”按钮
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
          chrome.runtime.sendMessage({ action: 'fetchBib',url: url }, res => {
            if (res.error) {
              showToast('❌ 复制失败：' + res.error);
              return;
            }
            const bib = res.bib;
            const finish = () => {
             window.location.replace(window.location.href);
              copyWithTextarea(bib);
              showToast('✔️ BibTeX 已复制');
            };
            if (navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(bib).then(finish).catch(finish);
            } else finish();
          });
        } catch (err) {
          document.getElementById('hidePopup')?.remove();
          console.error(err);
          showToast('❌ 操作失败：' + err.message);
        }
        finally{
        }
      });

      citeLink.parentNode.insertBefore(btn, citeLink.nextSibling);
    });
  }

// —— 修改：fetchFirstBib 接收关键词 q，并打开新窗口取 document —— 
  async function fetchFirstBib(q) {
    try {
      if (!q) throw new Error('未提供搜索关键词');
      const url = `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`;
      // 打开一个新窗口
      const win = window.open(url, '_blank');
      if (!win) throw new Error('无法打开新窗口');
      // 等待页面 load 完成
      await new Promise(resolve => {
        win.addEventListener('load', () => resolve(), { once: true });
      });
    
    window.addEventListener('message', e => {
    if (e.data?.type !== 'MY_EXT_BIB_URL') return;
    const bibUrl = e.data.url;
    if (!bibUrl) {
        showToast('❌ 没拿到 BibTeX URL');
        return;
    }
    win.close();
    console.log(bibUrl);

     chrome.runtime.sendMessage({ action: 'fetchBib',url: bibUrl}, res => {
            if (res.error) {
              showToast('❌ 复制失败：' + res.error);
              return;
            }
            const bib = res.bib;
            console.log(bib);
            const finish = () => {
             appendToClipboard(bib);
              showToast('✔️ BibTeX 已复制'); // 加数量
            };
            finish();
          });
          
    showToast('✔️ 打开 BibTeX');
    });

 
    const script = win.document.createElement('script');
    script.src = chrome.runtime.getURL('triggerCite.js');
    win.document.head.appendChild(script);
    
    } catch (e) {
      console.error(e);
      showToast('❌ ' + e.message);
    }
  }

  // —— 修改：按钮点击时把 q 传给 fetchFirstBib —— 
  function injectGlobalButton() {
    const form = document.getElementById('gs_hdr_frm');
    if (!form || document.getElementById('firstBibGlobalBtn')) return;
    const submit = form.querySelector('button[type="submit"], input[type="submit"]');
    if (!submit) return;

    const btn = document.createElement('button');
    btn.id = 'firstBibGlobalBtn';
    btn.type = 'button';
    btn.textContent = 'Get 1st BibTeX';
    btn.style.cssText = `
      margin-left: 8px;
      padding: 6px 12px;
      font-size: 14px;
      cursor: pointer;
      border: none;
      border-radius: 4px;
      background-color: #34A853;
      color: #fff;
    `;
    submit.parentNode.insertBefore(btn, submit.nextSibling);

    btn.addEventListener('click', () => {
      const q = form.querySelector('input[name="q"]')?.value.trim();
      if (!q) return showToast('请输入搜索关键词');
      // 把 q 传给 fetchFirstBib，打开新窗口并加载搜索结果
      fetchFirstBib(q);
    });
  }

  // 启动两个观察者
  new MutationObserver(injectGlobalButton).observe(document.body, observerConfig);
  new MutationObserver(injectButtons).observe(document.body, observerConfig);
  // 初次执行
  injectGlobalButton();
  injectButtons();
})();
