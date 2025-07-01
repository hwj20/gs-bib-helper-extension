// content.js
// 在搜索结果页给每条结果旁加 “CopyBib” 按钮：
// 点击时：
// 1) 隐式触发“引用”弹层（不显示）；
// 2) 提取 BibTeX URL → 交给 background fetch；
// 3) 拿到纯文本后复制到剪贴板，并关闭弹层。

(() => {
  const observerConfig = { childList: true, subtree: true };

  // 辅助：通过 textarea 复制文本
  function copyWithTextarea(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      console.error('execCommand failed', e);
    }
    ta.remove();
  }

  // 关闭 Scholar 引用弹层及遮罩
  function closePopup() {
    // 点击弹层右上角“取消”按钮
    const cancelBtn = document.querySelector('#gs_cit-x');
    if (cancelBtn) {
      cancelBtn.click();
    }
    // 移除遮罩、容器和弹窗节点
    [
      '#gs_cit',
      '#gs_md_cit-overlay',
      '.gs_md_dock_wrapper',
      '.gs_citr',
      '.gs_ocd_citr'
    ].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    });
  }

  // 注入 CopyBib 按钮
  function injectButtons() {
    document.querySelectorAll('.gs_ri').forEach(item => {
      if (item.dataset.bibBtnAdded) return;
      const citeLink = item.querySelector('.gs_or_cit');
      if (!citeLink) return;
      item.dataset.bibBtnAdded = '1';

      const btn = document.createElement('button');
      btn.textContent = 'CopyBib';
      btn.style.cssText = 'margin-left:6px;padding:2px 6px;font-size:90%;cursor:pointer;';
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        // 隐藏弹层，避免闪烁
        let cssHide = document.getElementById('hidePopup');
        if (!cssHide) {
          cssHide = document.createElement('style');
          cssHide.id = 'hidePopup';
          cssHide.textContent = '#gs_cit, #gs_md_cit-overlay, .gs_md_dock_wrapper, .gs_citr, .gs_ocd_citr { display: none !important; }';
          document.head.appendChild(cssHide);
        }

        try {
          // 触发引用弹层，仅执行 onclick 脚本，不导航
          triggerCite(citeLink);

          // 等待并提取 .bib 链接
          const url = await waitForBibtexUrl();

          // 移除隐藏样式并关闭弹层
          cssHide.remove();
          closePopup();

          // 将 URL 发给 background fetch
          chrome.runtime.sendMessage({ action: 'fetchBib', url }, res => {
            if (res.error) {
              alert('❌ 复制失败：' + res.error);
              return;
            }
            const bib = res.bib;
            console.log('【BibTeX 原文】', bib);

            // 使用 Clipboard API
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(bib)
                .then(() => alert('✔️ BibTeX 已复制'))
                .catch(err => {
                  console.warn('Clipboard API failed, fallback to execCommand', err);
                  copyWithTextarea(bib);
                  alert('✔️ BibTeX 已复制');
                });
            } else {
              copyWithTextarea(bib);
              alert('✔️ BibTeX 已复制');
            }

            // 再次确保关闭弹层
            closePopup();
          });
        } catch (err) {
          cssHide?.remove();
          console.error(err);
          alert('❌ 操作失败：' + err.message);
          closePopup();
        }
      });

      citeLink.parentNode.insertBefore(btn, citeLink.nextSibling);
    });
  }

  // 模拟链接点击：移除 href 阻止 javascript: 导航，执行 onclick
  function triggerCite(link) {
    const origHref = link.getAttribute('href');
    link.removeAttribute('href');
    const prevent = e => e.preventDefault();
    link.addEventListener('click', prevent, true);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    link.removeEventListener('click', prevent, true);
    if (origHref !== null) {
      link.setAttribute('href', origHref);
    }
  }

  // 等待并提取 .bib URL
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

  // 初始化
  new MutationObserver(injectButtons).observe(document.body, observerConfig);
  injectButtons();
})();
