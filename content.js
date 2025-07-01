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
    
  const onMessage = async e => {
    if (e.data?.type !== 'MY_EXT_BIB_URL') return;

    // 先把自己撤掉，确保只执行一次
    window.removeEventListener('message', onMessage);

    const bibUrl = e.data.url;
    if (!bibUrl) {
      showToast('❌ 没拿到 BibTeX URL');
      return;
    }

    win.close();
    console.log(bibUrl);

    chrome.runtime.sendMessage({ action: 'fetchBib', url: bibUrl }, res => {
      if (res.error) {
        showToast('❌ 复制失败：' + res.error);
        return;
      }
      const bib = res.bib;
      appendToClipboard(bib);
      showToast('✔️ BibTeX 已复制');
    });

    showToast('✔️ 打开 BibTeX');
  };

  // 在注入脚本前绑定
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

  // 把 form 设成 inline-flex，保证水平对齐
  form.style.display = 'inline-flex';
  form.style.alignItems = 'center';

  // 找到所有 submit 元素，取最后一个（通常就是蓝色放大镜）
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

  // 把绿按钮插到蓝色搜索按钮后面
  searchBtn.insertAdjacentElement('afterend', btn);

  btn.addEventListener('click', () => {
    const q = form.querySelector('input[name="q"]')?.value.trim();
    if (!q) return showToast('请输入搜索关键词');
    const finish = () => {
        copyWithTextarea("");
    };
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText("").then(finish).catch(finish);
    } else finish();

    fetchFirstBib(q);
  });
  // 右键点击：批量模式
  btn.addEventListener('contextmenu', e => {
    e.preventDefault();

    // 1. 创建遮罩层
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', top:0, left:0, right:0, bottom:0,
      background: 'rgba(0,0,0,0.5)', display:'flex',
      alignItems:'center', justifyContent:'center', zIndex:10000
    });

    // 2. 创建对话框
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
    ta.placeholder = '每行一个标题，按换行分隔';

    const go = document.createElement('button');
    go.textContent = '开始批量获取';
    Object.assign(go.style, {
      padding:'8px 8px', cursor:'pointer',
      background:'#4285F4', color:'#fff', border:'none',
      borderRadius:'4px'
    });

    // 3. 点击「开始批量获取」
    go.addEventListener('click', () => {
      const lines = ta.value
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
      if (lines.length === 0) {
        showToast('请输入至少一个标题');
        return;
      }
        const finish = () => {
            copyWithTextarea("");
        };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText("").then(finish).catch(finish);
        } else finish();

      // 依次调用 fetchFirstBib，每次间隔 2s（防止同时打开过多窗口）
      lines.forEach((title, i) => {
        setTimeout(() => fetchFirstBib(title), i * 2000);
      });
      document.body.removeChild(overlay);
      showToast(`已开始批量处理 ${lines.length} 条`);
    });

    // 4. 取消对话框时点遮罩层空白
    overlay.addEventListener('click', ev => {
      if (ev.target === overlay) document.body.removeChild(overlay);
    });

    dialog.appendChild(ta);
    dialog.appendChild(go);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  });


}

  // 启动两个观察者
  new MutationObserver(injectGlobalButton).observe(document.body, observerConfig);
  new MutationObserver(injectButtons).observe(document.body, observerConfig);
  // 初次执行
  injectGlobalButton();
  injectButtons();
})();
