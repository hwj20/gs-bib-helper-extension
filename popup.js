document.getElementById('generate').addEventListener('click', () => {
const raw = document.getElementById('queries').value;
const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
const autoCopy = document.getElementById('autoCopyPopup').checked;
const outArea = document.getElementById('bibResults');
outArea.value = 'Generating...';
const results = [];

Promise.all(lines.map(q => {
// Fetch search results page and extract cluster ID
return fetch(https://scholar.google.com/scholar?hl=en&q=${encodeURIComponent(q)})
.then(r => r.text())
.then(html => {
const doc = new DOMParser().parseFromString(html, 'text/html');
const first = doc.querySelector('.gs_ri');
if (!first) return '';
const container = first.closest('.gs_r');
const cid = container?.getAttribute('data-cid');
if (!cid) return '';
const bibUrl = https://scholar.google.com/scholar.bib?hl=en&output=citation&cluster=${cid};
return fetch(bibUrl).then(r => r.text()).catch(() => '');
});
})).then(bibs => {
const all = bibs.join('\n');
outArea.value = all;
if (autoCopy) navigator.clipboard.writeText(all);
});
});