/*
  Assemble the four standalone prototype pages into ONE self-contained file.

  Rules the bundle has to respect:
  - the icon sprite is emitted once, not four times;
  - dialogs are deduplicated — index.html's payment/reminder dialogs are the
    generic, data-bound ones, so the copies on subscriber.html and
    client-card.html are dropped and their screens carry a `data-subscriber`
    payload instead, which is what seedDialog() reads;
  - cross-page links become in-page screen switches.
*/
import { readFileSync, writeFileSync } from 'node:fs';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* The prototype folder, one level up from this script. */
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..') + '/';
const read = (f) => readFileSync(join(DIR, f), 'utf8');

/* Split a page into { sprite, shell, dialogs }. */
function parse(file) {
  const src = read(file);
  const spriteStart = src.indexOf('<svg width="0"');
  const spriteEnd = src.indexOf('</defs></svg>') + '</defs></svg>'.length;
  const sprite = src.slice(spriteStart, spriteEnd);

  const rest = src.slice(spriteEnd);
  const dlgAt = rest.indexOf('<!-- ══');
  const scriptAt = rest.indexOf('<script src=');
  const cut = dlgAt === -1 ? scriptAt : dlgAt;

  return {
    sprite,
    shell: rest.slice(0, cut).trim(),
    dialogs: dlgAt === -1 ? '' : rest.slice(dlgAt, scriptAt).trim(),
  };
}

const dash = parse('index.html');
const sub = parse('subscriber.html');
const pkg = parse('packages.html');
const card = parse('client-card.html');

/* Cross-page hrefs become screen switches. */
const link = (html) =>
  html
    .replace(/href="index\.html"/g, 'href="#dashboard" data-goto="dashboard"')
    .replace(/href="subscriber\.html"/g, 'href="#subscriber" data-goto="subscriber"')
    .replace(/href="packages\.html"/g, 'href="#packages" data-goto="packages"')
    .replace(/href="client-card\.html"/g, 'href="#client" data-goto="client"');

/*
  The subscriber and client screens open the shared dialogs, so they must hand
  over their own figures the way a register row does.
*/
const SUHA =
  '{"name":"سُهى النجار","package":"اشتراك شهري","price":150,"paid":0,"due":150,"dueDate":"5 آب","lateDays":18}';

const screen = (id, html, payload) =>
  `<div class="screen" data-screen="${id}"${payload ? ` data-subscriber='${payload}'` : ''}${
    id === 'dashboard' ? '' : ' hidden'
  }>\n${link(html)}\n</div>`;

const css = readFileSync(DIR + 'finance.css', 'utf8');
const js = readFileSync(DIR + 'finance.js', 'utf8');

const router = `
/* ── Screen switching, for the single-file bundle only ─────────────── */
function showScreen(id) {
  document.querySelectorAll('[data-screen]').forEach((s) => {
    s.hidden = s.dataset.screen !== id;
  });
  window.scrollTo(0, 0);
  if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
}
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', (event) => {
    const a = event.target.closest('[data-goto]');
    if (!a) return;
    event.preventDefault();
    showScreen(a.dataset.goto);
  });
  const wanted = location.hash.replace('#', '');
  if (document.querySelector(\`[data-screen="\${wanted}"]\`)) showScreen(wanted);
});
`;

const out = `<!doctype html>
<!--
  ══════════════════════════════════════════════════════════════════════
  إنزيم / Qiwam — نموذج الأمور المالية · Finance prototype
  ══════════════════════════════════════════════════════════════════════

  ملف واحد قائم بذاته. لا يحتاج خادماً ولا اتصالاً (عدا الخطوط).
  A single self-contained file. No server, no build step.

  **No production code is touched by this prototype.**

  الشاشات الأربع تتبدّل من الشريط الجانبي:
    لوحة الأمور المالية · الملف المالي لمشترك · الباقات والرسائل ·
    بطاقة الملخص المالي داخل صفحة العميل

  ع / EN يقلب اللغة والاتجاه · زر القمر يقلب الوضع الداكن
-->
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>إنزيم — نموذج الأمور المالية</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=Readex+Pro:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
${css}
/* The bundle stacks four screens; only one is shown at a time. */
.screen[hidden] { display: none; }
</style>
</head>
<body>

${dash.sprite}

${screen('dashboard', dash.shell)}

${screen('subscriber', sub.shell, SUHA)}

${screen('packages', pkg.shell)}

${screen('client', card.shell, SUHA)}

<!-- ══ Shared dialogs — one set for all four screens ═══════════════════ -->
${link(dash.dialogs)}

${link(pkg.dialogs)}

<script>
${js}
${router}
</script>
</body>
</html>
`;

const target = DIR + 'qiwam-finance-prototype.html';
writeFileSync(target, out, 'utf8');
console.log('wrote', target, (out.length / 1024).toFixed(0) + ' KB');
