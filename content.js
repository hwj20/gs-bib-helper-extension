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
    ['#gs_cit','#gs_md_cit-overlay','.gs_md_dock_wrapper','.gs_citr','.gs_ocd_citr']
      .forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));
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

  // 等待并提取 .bib 链接
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
          hideStyle.remove();
          closePopup();
          chrome.runtime.sendMessage({ action: 'fetchBib', url }, res => {
            if (res.error) {
              showToast('❌ 复制失败：' + res.error);
              closePopup();
              return;
            }
            const bib = res.bib;
            const finish = () => {
             window.location.replace(window.location.href);
              copyWithTextarea(bib);
              showToast('✔️ BibTeX 已复制');
              closePopup();
            };
            if (navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(bib).then(finish).catch(finish);
            } else finish();
          });
        } catch (err) {
          document.getElementById('hidePopup')?.remove();
          console.error(err);
          showToast('❌ 操作失败：' + err.message);
          closePopup();
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

      const doc = win.document;  // 这里就拿到新窗口的 document
      showToast(`已在新窗口打开 Google Scholar 并加载 "${q}" 的搜索结果`);

      // 以下就是在新窗口里抓第一个结果 Cite 按钮并模拟点击的逻辑
      const first = doc.querySelector('.gs_ri');
      if (!first) throw new Error('未找到搜索结果');
      const citeLink = first.querySelector('.gs_or_cit');
      if (!citeLink) throw new Error('未找到 Cite 按钮');

      showToast('正在获取第一个结果的 BibTeX…');

      // 隐藏弹层样式
      let hideStyle = doc.getElementById('hidePopup');
      if (!hideStyle) {
        hideStyle = doc.createElement('style');
        hideStyle.id = 'hidePopup';
        hideStyle.textContent = `
          #gs_cit,#gs_md_cit-overlay,
          .gs_md_dock_wrapper,.gs_citr,.gs_ocd_citr {
            display: none !important;
          }
        `;
        doc.head.appendChild(hideStyle);
      }

      // 模拟点击弹出 Cite 弹层
      triggerCite.call(win, citeLink);
      // 等待 .bib 链接出现
      const bibUrl = await waitForBibtexUrl.call(doc);
      hideStyle.remove();
      closePopup.call(win);

      // 用现有的后台 fetchBib 去下载并复制
      chrome.runtime.sendMessage({ action: 'fetchBib', url: bibUrl }, res => {
        if (res.error) return showToast('❌ 复制失败：' + res.error);
        const bib = res.bib;
        // 复制并提示
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(bib).then(() => showToast('✔️ 第一个 BibTeX 已复制'));
        } else {
          copyWithTextarea(bib);
          showToast('✔️ 第一个 BibTeX 已复制');
        }
      });

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
