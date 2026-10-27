(function () {
  const KEY = 'hist2'; // {champ: {texte: nombre}}
  let hist = {};
  const store = () => chrome.storage.local.set({ [KEY]: hist });
  chrome.storage.local.get(KEY, r => { hist = r[KEY] || {}; start(); });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c[KEY]) hist = c[KEY].newValue || {};
  });

  function start() {
    const SEL = 'input:not([type]),input[type=text],input[type=search],input[type=tel],input[type=url],textarea';
    const SENSITIVE = /pass|pwd|otp|cvv|cvc|card|iban|secret|token|pin|code/i;
    const sensitive = el => SENSITIVE.test((el.name || '') + ' ' + (el.id || '')) ||
      /cc-|one-time-code|password/.test(el.getAttribute('autocomplete') || '');
    const ok = el => el && el.matches && el.matches(SEL) && !sensitive(el);

    // Retire un suffixe entre parenthèses : "NOM (Feu)" -> "NOM"
    const clean = s => s.replace(/\s*\([^)]{1,15}\)\s*$/, '').trim();

    // Identifiant du champ : nom (ou id) + libellé/placeholder
    function fieldKey(el) {
      const name = (el.getAttribute('name') || '').trim();
      const id = (el.id || '').replace(/\d+/g, '#');
      let lab = '';
      try { if (el.labels && el.labels[0]) lab = el.labels[0].textContent; } catch (e) {}
      lab = (lab || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '')
        .replace(/\s+/g, ' ').trim().slice(0, 40);
      const key = ((name || id) + '|' + lab).toLowerCase();
      return key === '|' ? 'champ|' + (el.type || el.tagName.toLowerCase()) : key;
    }

    function prune() {
      const out = {};
      Object.keys(hist).forEach(f => {
        const h = {};
        Object.keys(hist[f]).forEach(k => {
          const c = clean(k);
          if (c.length >= 2) h[c] = (h[c] || 0) + hist[f][k];
        });
        if (Object.keys(h).length) out[f] = h;
      });
      const changed = JSON.stringify(out) !== JSON.stringify(hist);
      hist = out;
      if (changed) store();
    }
    prune();

    function save(el) {
      const v = clean(el.value || '');
      if (v.length < 2 || v.length > 60 || v.includes('\n')) return;
      if (/^\d{12,19}$/.test(v.replace(/[\s-]/g, ''))) return;
      const f = fieldKey(el);
      const h = hist[f] || (hist[f] = {});
      h[v] = (h[v] || 0) + 1;
      store();
    }

    const COARSE = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;z-index:2147483647;background:#fff;color:#000;' +
      'border:1px solid #888;font:14px sans-serif;display:none;max-height:' + (COARSE ? '150px' : '260px') + ';overflow:auto;box-shadow:0 2px 8px #0004';
    const list = document.createElement('div');
    const hint = document.createElement('div');
    hint.textContent = '\u2191\u2193 choisir \u00b7 Tab valider \u00b7 Suppr effacer';
    hint.style.cssText = 'padding:3px 10px;font-size:11px;color:#666;background:#f3f3f3;border-top:1px solid #ddd';
    box.appendChild(list);
    if (!COARSE) box.appendChild(hint);
    document.documentElement.appendChild(box);
    let cur = null, idx = -1, items = [];

    function removeEntry(t) {
      const h = hist[fieldKey(cur)];
      if (h && t in h) { delete h[t]; store(); }
    }
    // v1.7 : la liste disparaît dès le toucher ; le « clic » qui suit tombait sur ce qu'il y avait dessous
    // (ex. la case « Sans profession »). On avale tous les clics / touchers pendant 600 ms.
    function blockGhost() {
      const stop = e => { if (box.contains(e.target)) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
      const ev = ['click', 'mousedown', 'mouseup', 'touchend', 'pointerup'];
      ev.forEach(n => document.addEventListener(n, stop, true));
      setTimeout(() => ev.forEach(n => document.removeEventListener(n, stop, true)), 600);
    }
    function hide() { box.style.display = 'none'; idx = -1; }
    function fill(t) {
      const tgt = cur;
      tgt.value = t;
      tgt.dispatchEvent(new Event('input', { bubbles: true }));
      save(tgt);
      hide();
      tgt.dispatchEvent(new CustomEvent('tadidy-pick', { bubbles: true }));   // l'application passe au champ suivant (téléphone)
    }
    function highlight() {
      [...list.children].forEach((c, i) => c.style.background = i === idx ? '#cde' : '#fff');
    }
    function show(el) {
      cur = el;
      const v = el.value.trim().toLowerCase();
      if (v.length < 2) return hide();
      const h = hist[fieldKey(el)] || {};
      items = Object.keys(h)
        .filter(t => t.toLowerCase().startsWith(v) && t.toLowerCase() !== v)
        .sort((a, b) => h[b] - h[a]).slice(0, COARSE ? 3 : 8);   // v1.7 : 3 au maximum sur téléphone (ne cache plus l'image)
      if (!items.length) return hide();
      list.innerHTML = '';
      items.forEach(t => {
        const d = document.createElement('div');
        d.style.cssText = 'padding:' + (COARSE ? '9px 12px' : '5px 10px') + ';cursor:pointer;display:flex;justify-content:space-between;gap:14px;' + (COARSE ? 'font-size:16px;' : '');
        const label = document.createElement('span');
        label.textContent = t;
        const x = document.createElement('span');
        x.textContent = '\u2715';
        x.title = 'Supprimer cette suggestion';
        x.style.cssText = 'color:#b33;padding:0 4px;cursor:pointer';
        x.addEventListener('mousedown', e => {
          e.preventDefault(); e.stopPropagation();
          removeEntry(t);
          show(cur);
        });
        d.appendChild(label);
        d.appendChild(x);
        let usedAt = 0;
        const pick = e => { e.preventDefault(); if (Date.now() - usedAt < 400) return; usedAt = Date.now(); blockGhost(); fill(t); };
        d.addEventListener('touchend', e => { e.preventDefault(); });
        d.addEventListener('pointerdown', pick);
        d.addEventListener('mousedown', pick);
        list.appendChild(d);
      });
      const r = el.getBoundingClientRect();
      box.style.left = r.left + scrollX + 'px';
      box.style.top = r.bottom + scrollY + 'px';
      box.style.minWidth = r.width + 'px';
      box.style.display = 'block';
      if (r.bottom + box.offsetHeight > (window.visualViewport ? visualViewport.height : innerHeight) - 4 && r.top > box.offsetHeight) box.style.top = (r.top - box.offsetHeight + scrollY) + 'px';   // pas caché par le clavier
      idx = -1;
      highlight();
    }

    document.addEventListener('input', e => {
      if (ok(e.target)) { e.target.setAttribute('autocomplete', 'off'); show(e.target); }
    }, true);
    document.addEventListener('change', e => { if (ok(e.target)) save(e.target); }, true);
    document.addEventListener('submit', e => e.target.querySelectorAll(SEL).forEach(el => { if (ok(el)) save(el); }), true);
    document.addEventListener('blur', e => { if (ok(e.target)) { save(e.target); hide(); } }, true);
    document.addEventListener('keydown', e => {
      if (box.style.display === 'none') return;
      if (e.key === 'ArrowDown') { idx = (idx + 1) % items.length; highlight(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = idx <= 0 ? items.length - 1 : idx - 1; highlight(); e.preventDefault(); }
      else if (e.key === 'Tab' && idx >= 0) { fill(items[idx]); }
      else if (e.key === 'Enter' && idx >= 0) { fill(items[idx]); e.preventDefault(); }
      else if (e.key === 'Delete' && idx >= 0) {
        e.preventDefault();
        const old = idx;
        removeEntry(items[idx]);
        show(cur);
        if (box.style.display !== 'none') { idx = Math.min(old, items.length - 1); highlight(); }
      }
      else if (e.key === 'Escape') hide();
    }, true);
  }
})();
