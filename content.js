// content.js
// 在搜索结果页给每条结果旁加 “CopyBib” 按钮：
// 点击时：
// 1) 隐式触发“引用”弹层（不显示）；
// 2) 提取 BibTeX URL → 交给 background fetch；
// 3) 拿到纯文本后复制到剪贴板。

(() => {
  const observerConfig = { childList: true, subtree: true };

  // 注入按钮
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
        // 隐藏 Scholar 弹层
        let css = document.getElementById('hidePopup');
        if (!css) {
          css = document.createElement('style');
          css.id = 'hidePopup';
          css.textContent = '.gs_citr, .gs_ocd_citr { display: none !important; }';
          document.head.appendChild(css);
        }
        try {
          // 触发“引用”弹层，但阻止 href 导航
          triggerCite(citeLink);

          // 提取真正的 .bib 链接
          const url = await waitForBibtexUrl();

          // 清理隐藏样式 & 弹层 DOM
          css.remove();
          document.querySelectorAll('.gs_citr, .gs_ocd_citr').forEach(el => el.remove());

          // 发给 background 去 fetch 并返回 BibTeX 文本
          chrome.runtime.sendMessage({ action: 'fetchBib', url }, res => {
            if (res.error) {
              return alert('❌ 复制失败：' + res.error);
            }
            console.log('【BibTeX 原文】', res.bib);

            // 复制到剪贴板
            const ta = document.createElement('textarea');
            ta.value = res.bib;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();

            alert('✔️ BibTeX 已复制');
          });
        } catch (err) {
          // 出错时清理并提示
          css?.remove();
          console.error(err);
          alert('❌ 操作失败：' + err.message);
        }
      });
      citeLink.parentNode.insertBefore(btn, citeLink.nextSibling);
    });
  }

  // 阻止默认导航，执行 onclick 打开弹层脚本
  function triggerCite(link) {
    const prevent = e => e.preventDefault();
    link.addEventListener('click', prevent, true);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    link.removeEventListener('click', prevent, true);
  }

  // 等待并提取 BibTeX URL，要求 href 中包含 .bib
  function waitForBibtexUrl(timeout = 3000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const mo = new MutationObserver(() => {
        const a = Array.from(document.querySelectorAll('a'))
                       .find(x => /bibtex/i.test(x.textContent) && /\.bib(\?|$)/.test(x.href));
        if (a) {
          mo.disconnect();
          let url = a.href;
          if (url.startsWith('//'))       url = 'https:' + url;
          else if (url.startsWith('/'))   url = 'https://scholar.google.com' + url;
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
