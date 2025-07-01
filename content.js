// content.js
// 在谷歌学术搜索结果页，为每个结果注入 “CopyBib” 按钮：
// 点击时：隐式触发“引用”弹层 → 提取 .bib 链接 → 背景脚本 fetch → 复制 BibTeX → 刷新页面 → toast 提示

(() => {
  const observerConfig = { childList: true, subtree: true };

  // —— 新增：非阻塞 toast —— 
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

  // —— 新增：页面刚加载就检查标记 —— 
  if (sessionStorage.getItem('bibCopied')) {
    sessionStorage.removeItem('bibCopied');
    // 刷新刚执行完毕（或第一次加载也会进来，没标记就不弹）
    showToast('✔️ BibTeX 已复制');
  }

  // 辅助：通过 textarea 复制文本
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

  // 关闭 Scholar “引用” 弹层及遮罩
  function closePopup() {
    const cancelBtn = document.querySelector('#gs_cit-x');
    if (cancelBtn) cancelBtn.click();
    ['#gs_cit','#gs_md_cit-overlay','.gs_md_dock_wrapper','.gs_citr','.gs_ocd_citr']
      .forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));
  }

  // 模拟点击 citeLink.onclick，不导航
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
  function waitForBibtexUrl(timeout = 3000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const mo = new MutationObserver(() => {
        const a = Array.from(document.querySelectorAll('a'))
          .find(x => /bibtex/i.test(x.textContent) && /\.bib(\?|$)/.test(x.href));
        if (a) {
          mo.disconnect();
          let url = a.href;
          if (url.startsWith('//')) url = 'https:' + url;
          else if (url.startsWith('/')) url = 'https://scholar.google.com' + url;
          resolve(url);
        } else if (Date.now() - start > timeout) {
          mo.disconnect();
          reject(new Error('等待 BibTeX 链接超时'));
        }
      });
      mo.observe(document.body, observerConfig);
    });
  }

  // 注入按钮逻辑
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
        // 隐藏弹层
        let hideStyle = document.getElementById('hidePopup');
        if (!hideStyle) {
          hideStyle = document.createElement('style');
          hideStyle.id = 'hidePopup';
          hideStyle.textContent = `
            #gs_cit,#gs_md_cit-overlay,
            .gs_md_dock_wrapper,.gs_citr,
            .gs_ocd_citr { display: none !important; }
          `;
          document.head.appendChild(hideStyle);
        }

        try {
          triggerCite(citeLink);
          const url = await waitForBibtexUrl();
          hideStyle.remove();
          closePopup();

          chrome.runtime.sendMessage({ action: 'fetchBib', url }, res => {
            if (res.error) {
              showToast('❌ 复制失败：' + res.error);
              closePopup();
              return;
            }
            const bib = res.bib;
            // —— 改动：复制完成后设置标记并刷新 —— 
            const finish = () => {
              sessionStorage.setItem('bibCopied', '1');
              location.reload();
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(bib)
                .then(finish)
                .catch(() => {
                  copyWithTextarea(bib);
                  finish();
                });
            } else {
              copyWithTextarea(bib);
              finish();
            }
            closePopup();
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

  new MutationObserver(injectButtons).observe(document.body, observerConfig);
  injectButtons();
})();
