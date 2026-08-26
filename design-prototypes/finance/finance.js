/*
  Prototype behaviour only: language flip, theme flip, dialogs, and the payment
  arithmetic the mockup demonstrates (a payment is subtracted from the balance
  and appended to the ledger). Production does all of this server-side through
  a feature action; nothing here is a suggested implementation.
*/

/* ── Language ────────────────────────────────────────────────────────── */
function applyLocale(locale) {
  const html = document.documentElement;
  html.lang = locale;
  html.dir = locale === 'ar' ? 'rtl' : 'ltr';

  document.querySelectorAll('[data-en]').forEach((el) => {
    if (el.dataset.ar === undefined) el.dataset.ar = el.textContent;
    el.textContent = locale === 'ar' ? el.dataset.ar : el.dataset.en;
  });
  document.querySelectorAll('[data-en-label]').forEach((el) => {
    if (el.dataset.arLabel === undefined) el.dataset.arLabel = el.getAttribute('aria-label') || '';
    el.setAttribute('aria-label', locale === 'ar' ? el.dataset.arLabel : el.dataset.enLabel);
  });

  document.querySelectorAll('[data-locale-btn]').forEach((btn) => {
    btn.setAttribute('aria-selected', String(btn.dataset.localeBtn === locale));
  });
  try { localStorage.setItem('qiwam-proto-locale', locale); } catch { /* file:// */ }
}

/* ── Theme ───────────────────────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try { localStorage.setItem('qiwam-proto-theme', theme); } catch { /* file:// */ }
}

/* ── Toast ───────────────────────────────────────────────────────────── */
function toast(ar, en) {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    document.body.append(host);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const span = document.createElement('span');
  span.dataset.en = en;
  span.dataset.ar = ar;
  span.textContent = document.documentElement.lang === 'ar' ? ar : en;
  el.append(span);
  host.append(el);
  setTimeout(() => el.remove(), 4200);
}

/* ── Money ───────────────────────────────────────────────────────────── */
const money = (n) => new Intl.NumberFormat('en-US').format(Math.round(n));

/* ── Boot ────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  let locale = 'ar';
  let theme = 'light';
  try {
    locale = localStorage.getItem('qiwam-proto-locale') || 'ar';
    theme = localStorage.getItem('qiwam-proto-theme') || 'light';
  } catch { /* file:// */ }
  applyLocale(locale);
  applyTheme(theme);

  document.querySelectorAll('[data-locale-btn]').forEach((btn) => {
    btn.addEventListener('click', () => applyLocale(btn.dataset.localeBtn));
  });
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () =>
      applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark'),
    );
  });

  /* Dialogs: [data-open="id"] opens, [data-close] closes the nearest one. */
  document.querySelectorAll('[data-open]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const dlg = document.getElementById(trigger.dataset.open);
      if (!dlg) return;
      // Row triggers can seed the dialog with their own subscriber.
      const row = trigger.closest('[data-subscriber]');
      if (row) seedDialog(dlg, JSON.parse(row.dataset.subscriber));
      dlg.showModal();
    });
  });
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('dialog')?.close());
  });

  /* Toggle chips inside a group behave like a radio set. */
  document.querySelectorAll('[data-chipgroup]').forEach((group) => {
    group.addEventListener('click', (event) => {
      const chip = event.target.closest('.chip');
      if (!chip || !group.contains(chip)) return;
      group.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      group.dispatchEvent(new CustomEvent('chipchange', { detail: chip.dataset.value }));
    });
  });

  /* Filter segments on the register. */
  document.querySelectorAll('[data-filter-group]').forEach((group) => {
    group.addEventListener('click', (event) => {
      const btn = event.target.closest('button');
      if (!btn) return;
      group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      const want = btn.dataset.filter;
      document.querySelectorAll('[data-status]').forEach((row) => {
        row.hidden = want !== 'all' && row.dataset.status !== want;
      });
    });
  });
});

/* Fill the payment / reminder dialogs from a row's subscriber payload. */
function seedDialog(dlg, s) {
  // The payment dialog's arithmetic reads the balance from the dialog itself,
  // so the row that opened it has to hand the figure over.
  dlg.dataset.due = String(s.due ?? 0);
  const amount = dlg.querySelector('#pay-amount');
  if (amount) {
    amount.value = '';
    amount.max = String(s.due ?? 0);
    const after = dlg.querySelector('[data-bind-after]');
    if (after) {
      after.textContent = `${money(s.due ?? 0)} ₪`;
      after.className = 'money money--due';
    }
    const settles = dlg.querySelector('[data-bind-settles]');
    if (settles) settles.hidden = true;
  }
  dlg.querySelectorAll('[data-bind]').forEach((el) => {
    const key = el.dataset.bind;
    const value = key === 'due' || key === 'price' || key === 'paid' ? money(s[key]) : s[key];
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = value;
    else el.textContent = value;
  });
  const initials = dlg.querySelector('[data-bind-initials]');
  if (initials) initials.textContent = s.name.trim().charAt(0);
  const msg = dlg.querySelector('[data-wa-template]');
  if (msg) msg.textContent = renderReminder(s);
}

function renderReminder(s) {
  // Mirrors the default template on packages.html. The clinic can rewrite it
  // there; this is only what the mockup ships with.
  const late = s.lateDays > 0
    ? `\nمرّ على تاريخ الاستحقاق ${s.lateDays} يوماً.`
    : '';
  return (
    `مرحباً ${s.name} 🌿\n` +
    `تذكير ودّي من عيادة إنزيم للتغذية.\n\n` +
    `الاشتراك: ${s.package}\n` +
    `المتبقي: ${money(s.due)} ₪\n` +
    `تاريخ الاستحقاق: ${s.dueDate}${late}\n\n` +
    `يسعدنا استلام الدفعة في زيارتك القادمة، أو عبر التحويل البنكي.\n` +
    `شكراً لكِ 💚`
  );
}

/* ═════════════════════════════════════════════════════════════════════
   Behaviour for the agreed design.

   Everything below is presentation arithmetic for the mockup. In production
   the balance is never stored — it is `agreed_price - SUM(payments)` computed
   on read — and every mutation goes through a server action in
   `src/features/<feature>/`. Nothing here is a suggested implementation.
   ═══════════════════════════════════════════════════════════════════ */

const isAr = () => document.documentElement.lang === 'ar';
const say = (ar, en) => (isAr() ? ar : en);
const shekel = (n) => `${money(n)} ₪`;

document.addEventListener('DOMContentLoaded', () => {
  /* ── Panel tabs ──────────────────────────────────────────────────── */
  document.querySelectorAll('[data-tabs]').forEach((bar) => {
    bar.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-tab]');
      if (!btn) return;
      bar.querySelectorAll('button[data-tab]').forEach((b) => {
        const on = b === btn;
        b.setAttribute('aria-selected', String(on));
        const panel = document.getElementById(b.dataset.tab);
        if (panel) panel.hidden = !on;
      });
    });
  });

  /* ── Switches ────────────────────────────────────────────────────── */
  document.querySelectorAll('.switch').forEach((sw) => {
    sw.addEventListener('click', () => {
      const on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(on));
      const card = sw.closest('[data-active]');
      if (card) card.dataset.active = String(on);
    });
  });

  /* ── Register search ─────────────────────────────────────────────── */
  const search = document.querySelector('[data-search]');
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      document.querySelectorAll('[data-status]').forEach((row) => {
        const hay = `${row.dataset.name || ''} ${row.dataset.nameEn || ''}`.toLowerCase();
        row.hidden = q !== '' && !hay.includes(q);
      });
      updateRegisterCount();
    });
  }

  /* ── Payment dialog: live remaining balance ──────────────────────── */
  const payAmount = document.getElementById('pay-amount');
  if (payAmount) {
    const recompute = () => {
      const dlg = payAmount.closest('dialog');
      const due = Number(dlg.dataset.due || 0);
      const paying = Math.min(Math.max(Number(payAmount.value) || 0, 0), due);
      const after = due - paying;
      const el = dlg.querySelector('[data-bind-after]');
      if (el) {
        el.textContent = shekel(after);
        el.className = `money ${after === 0 ? 'money--zero' : 'money--due'}`;
      }
      const note = dlg.querySelector('[data-bind-settles]');
      if (note) note.hidden = after !== 0 || paying === 0;
    };
    payAmount.addEventListener('input', recompute);
    document.querySelectorAll('[data-pay-all]').forEach((btn) => {
      btn.addEventListener('click', () => {
        payAmount.value = payAmount.closest('dialog').dataset.due || '';
        recompute();
      });
    });
    document.getElementById('payment-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      payAmount.closest('dialog').close();
      toast('تم تسجيل الدفعة وخُصمت من المتبقي', 'Payment recorded and deducted from the balance');
    });
  }

  /* ── Reminder: nothing sends until Send is pressed ───────────────── */
  document.querySelectorAll('[data-send-reminder]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('dialog')?.close();
      toast('أُرسل التذكير وسُجّل في سجل المشترك', 'Reminder sent and written to the subscriber log');
    });
  });
  document.getElementById('bulk-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const n = document.querySelectorAll('#dlg-remind-bulk input[type=checkbox]:checked').length;
    event.target.closest('dialog').close();
    toast(`أُرسل ${n} تذكيرات`, `${n} reminders sent`);
  });

  /* ── Subscribe / renew: agreed price vs list price ───────────────── */
  const subPkg = document.getElementById('sub-package');
  const subPrice = document.getElementById('sub-price');
  if (subPkg && subPrice) {
    const reflectDiscount = () => {
      const list = Number(subPkg.selectedOptions[0]?.dataset.price || 0);
      const agreed = Number(subPrice.value) || 0;
      const out = document.querySelector('[data-bind-discount]');
      if (!out) return;
      const off = list - agreed;
      out.hidden = off <= 0;
      out.textContent = say(`خصم ${money(off)} ₪ عن سعر القائمة`, `${money(off)} ₪ off the list price`);
    };
    const sync = () => {
      const opt = subPkg.selectedOptions[0];
      const list = Number(opt.dataset.price || 0);
      subPrice.value = list;
      const listOut = document.querySelector('[data-bind-list]');
      if (listOut) listOut.textContent = shekel(list);
      const visits = document.querySelector('[data-bind-visits]');
      if (visits) visits.textContent = opt.dataset.visits || '—';
      reflectDiscount();
    };
    subPkg.addEventListener('change', sync);
    subPrice.addEventListener('input', reflectDiscount);
    sync();
  }

  /* ── Package editor: derived per-visit figure ────────────────────── */
  document.querySelectorAll('[data-pkg-card]').forEach((card) => {
    const read = (n) => Number(card.querySelector(`[data-pkg="${n}"]`)?.value) || 0;
    const refresh = () => {
      const out = card.querySelector('[data-pkg-derived]');
      if (!out) return;
      const price = read('price');
      const visits = read('visits');
      const per = visits > 0 ? Math.round(price / visits) : 0;
      out.innerHTML = say(
        `الزيارة الواحدة تكلّف <b>${money(per)} ₪</b> · المدة <b>${read('days')}</b> يوماً · <b>${read('plans')}</b> خطط`,
        `<b>${money(per)} ₪</b> per visit · <b>${read('days')}</b> days · <b>${read('plans')}</b> plans`,
      );
    };
    card.querySelectorAll('[data-pkg]').forEach((i) => i.addEventListener('input', refresh));
    refresh();
  });

  /* ── WhatsApp template preview ───────────────────────────────────── */
  const tmpl = document.getElementById('tmpl-body');
  if (tmpl) {
    const sample = {
      '{الاسم}': 'سُهى', '{الباقة}': 'اشتراك شهري', '{المتبقي}': '150',
      '{الاستحقاق}': '5 آب', '{العيادة}': 'عيادة إنزيم للتغذية',
    };
    const render = () => {
      let out = tmpl.value;
      for (const [k, v] of Object.entries(sample)) out = out.split(k).join(v);
      document.getElementById('tmpl-preview').textContent = out;
    };
    tmpl.addEventListener('input', render);
    document.querySelectorAll('.var-token').forEach((token) => {
      token.addEventListener('click', () => {
        const at = tmpl.selectionStart ?? tmpl.value.length;
        const text = token.textContent;
        tmpl.value = tmpl.value.slice(0, at) + text + tmpl.value.slice(at);
        tmpl.focus();
        tmpl.selectionStart = tmpl.selectionEnd = at + text.length;
        render();
      });
    });
    render();
  }

  updateRegisterCount();
});

/* How many rows the register is currently showing. */
function updateRegisterCount() {
  const out = document.querySelector('[data-row-count]');
  if (!out) return;
  out.textContent = String([...document.querySelectorAll('[data-status]')].filter((r) => !r.hidden).length);
}
