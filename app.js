// CENI Hors-ligne MOBILE (PWA) — saisie 1 hors serveur sur téléphone.
(function () {
  const ST = self.KV, B = { storage: { onChanged: { addListener() {} } } };
  const $ = id => document.getElementById(id);
  const stripZ = x => String(x == null ? '' : x).replace(/^0+/, '');
  const NO_IMG = 'Tsy misy sary mifanandrify amin\'ny numeros de feuilles voatondro.';
  const IDS = ['marquageInput', 'nomElect', 'prenomElect', 'dateNaiss', 'neversElect', 'lieuNaiss', 'handicapElect',
    'nomPereElect', 'nomMereElect', 'adresseElect', 'hamauElect', 'professionElect', 'cinElect', 'dateDeliv', 'lieuDeliv',
    'numSerieCinPart1', 'numSerieCinPart2', 'dRecensement', 'telephoneElect', 'emailElect', 'Observation'];
  const CHECKS = ['feuPere', 'piPere', 'feueMere', 'miMere', 'professionSans', 'anomalieCheckbox'];
  const SEQ = ['numeroLigneInput', 'marquageInput', 'nomElect', 'prenomElect', 'dateNaiss', 'neversElect', 'lieuNaiss',
    { id: 'sexeLahy', radio: 1 }, { id: 'sexeVavy', radio: 1 }, 'handicapElect', 'nomPereElect', 'feuPere', 'piPere',
    'nomMereElect', 'feueMere', 'miMere', 'adresseElect', 'hamauElect', 'professionElect', 'professionSans',
    'cinElect', 'dateDeliv', 'lieuDeliv', 'numSerieCinPart1', 'numSerieCinPart2', 'dRecensement', 'telephoneElect', 'emailElect', 'Observation'];
  const COVER_WORDS = /couv|cover|garde|titre/i;

  const recKey = (stage, carnet, feuillet) => 'rec|' + stage + '|' + carnet + '|' + stripZ(feuillet);
  const numOf = rel => { const l = String(rel || '').split('/').pop() || ''; const m = l.match(/\d+/g); return m ? m.sort((a, b) => b.length - a.length)[0] : ''; };
  const baseNumber = name => (String(name).replace(/\.[^.]+$/, '').match(/\d+/g) || []).sort((a, b) => b.length - a.length)[0] || '';
  const fmt = t => { try { return new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return ''; } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- état ----------
  let stage = '1', user = '', carnetNum = '', carnetRel = '';
  
  let manualRot = null, pages = [], handles = new Map(), idx = -1, rot = 0, zoom = 1, imgUrl = null, shownName = '';
  let recs = new Map();                 // stripZ(feuillet) -> { key, rec }
  let dirty = false, loading = false, numT = null;

  // =====================================================================
  // Stockage
  // =====================================================================
  async function allRecs() {
    const all = await ST.get(null);
    return Object.keys(all).filter(k => k.startsWith('rec|')).map(k => ({ key: k, rec: all[k] }));
  }
  async function loadRecs() {
    recs = new Map();
    if (!carnetNum) return;
    const pre = 'rec|' + stage + '|' + carnetNum + '|';
    (await allRecs()).filter(x => x.key.startsWith(pre)).forEach(x => recs.set(stripZ(x.rec.feuillet), x));
  }
  async function loadUsers() {
    const all = await ST.get(null);
    const names = new Set();
    Object.keys(all).forEach(k => { if (k.startsWith('carnets|')) names.add(k.slice(8)); });
    if (all.hoLastUser) names.add(all.hoLastUser);
    $('users').innerHTML = '';
    [...names].filter(Boolean).forEach(n => { const o = document.createElement('option'); o.value = n; $('users').appendChild(o); });
    return all;
  }
  // v1.1 : l'image n'est utile qu'en saisie 1 ; en saisie 2 on masque la visionneuse et le choix du dossier
  function applyStageUI() { /* mobile : saisie 1 uniquement */ }
  // ----- index des carnets : ceux qui ont des images importées ou des saisies -----
  async function carnetIndex() {
    const all = await ST.get(null);
    const m = new Map();
    const get = n => { if (!m.has(n)) m.set(n, { num: n, rel: '', label: '', rest: NaN, feuilles: [], nimg: 0 }); return m.get(n); };
    (await ST.imgKeys()).forEach(k => { const n = String(k).split('|')[0]; if (n) get(n).nimg++; });
    Object.keys(all).filter(k => k.startsWith('rec|1|')).forEach(k => { const r = all[k]; get(String(r.carnetNum)).feuilles.push({ key: k, rec: r }); });
    m.forEach(c => c.feuilles.sort((a, b) => Number(stripZ(a.rec.feuillet)) - Number(stripZ(b.rec.feuillet))));
    return { list: [...m.values()].sort((a, b) => a.num.localeCompare(b.num)), at: all.hoSyncAt || 0, all };
  }
  async function loadCarnetList() {
    const { list, at, all } = await carnetIndex();
    const recsAll = list.reduce((s2, c) => s2 + c.feuilles.length, 0);
    const newer = list.reduce((s2, c) => s2 + c.feuilles.filter(f => (f.rec.savedAt || 0) > (all.hoExportAt || 0) && !f.rec.sent).length, 0);
    $('info').textContent = list.length ? list.length + ' carnet(s) · ' + recsAll + ' feuille(s) saisie(s)' + (newer ? ' · ⚠ ' + newer + ' pas encore exportée(s)' : recsAll ? ' · tout exporté' : '') : 'Aucun carnet : ☰ Menu → Importer des images.';
    $('info').style.color = newer ? 'var(--wr)' : '';
    if ($('carnetsOv').classList.contains('open')) renderCarnets();
  }
  async function renderCarnets() {
    const { list, at } = await carnetIndex();
    $('carnetsInfo').textContent = at ? 'synchro du ' + fmt(at) : '';
    const box = $('carnetsList'); box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<div class="help">Aucun carnet pour le moment. Sur la page du serveur, cliquez sur « Synchroniser » (panneau en bas à gauche), ou tapez un n° de carnet.</div>'; }
    list.forEach(c => {
      const sent = c.feuilles.filter(f => f.rec.sent).length, bad = c.feuilles.filter(f => f.rec.bad).length;
      const row = document.createElement('div'); row.className = 'cr' + (carnetNum === c.num ? ' open' : '');
      row.innerHTML = '<div class="t"><b></b><span class="st"></span><span class="sp"></span><button class="pri o">Ouvrir</button><button class="v">Feuillets ▾</button></div><div class="fl"></div>';
      row.querySelector('b').textContent = c.num + (c.label ? ' — ' + c.label : '');
      row.querySelector('.st').textContent = (isNaN(c.rest) ? '' : c.rest + ' restant' + (c.rest > 1 ? 's' : '') + ' · ') + (c.nimg ? c.nimg + ' image(s) · ' : '') + c.feuilles.length + ' saisi(s) hors ligne · ' + sent + ' envoyé(s)' + (bad ? ' · ' + bad + ' inexploitable(s)' : '');
      const fl = row.querySelector('.fl');
      if (!c.feuilles.length) fl.textContent = 'Aucun feuillet saisi hors ligne.';
      c.feuilles.forEach(f => {
        const x = document.createElement('span'), r = f.rec;
        x.className = 'c' + (r.bad ? ' bad' : r.sent ? ' sent' : (r.srv && r.srv.exists) ? ' warn' : '');
        x.textContent = (r.bad ? '🚫 ' : r.sent ? '✓ ' : (r.srv && r.srv.exists) ? '⚠ ' : '● ') + r.feuillet;
        x.title = r.sent ? 'Envoyé le ' + fmt(r.sentAt) : 'Saisi le ' + fmt(r.savedAt);
        x.onclick = async () => { if (!(await confirmLeave())) return; $('carnetsOv').classList.remove('open'); await loadCarnet(c.num, c.rel, r.feuillet); };
        fl.appendChild(x);
      });
      row.querySelector('.o').onclick = async () => { if (!(await confirmLeave())) return; $('carnetsOv').classList.remove('open'); await loadCarnet(c.num, c.rel); };
      row.querySelector('.v').onclick = () => row.classList.toggle('open');
      box.appendChild(row);
    });
  }
  $('carnetsBtn').onclick = () => { $('carnetsOv').classList.add('open'); renderCarnets(); };
  $('carnetsX').onclick = () => $('carnetsOv').classList.remove('open');
  $('carnetsOv').addEventListener('mousedown', e => { if (e.target === $('carnetsOv')) $('carnetsOv').classList.remove('open'); });
  $('clrSent').onclick = async () => {
    const all = await ST.get(null);
    const ks = Object.keys(all).filter(k => k.startsWith('rec|') && all[k].sent);
    if (!ks.length) return alert('Aucun feuillet « envoyé » à vider.');
    if (!confirm(ks.length + ' feuillet(s) déjà envoyé(s) au serveur vont être supprimés d\'ici.\n(Les feuillets pas encore envoyés sont gardés.)\nContinuer ?')) return;
    await ST.remove(ks); await loadRecs(); renderRecs(); await loadCarnetList(); renderCarnets();
  };
  // =====================================================================
  // Images : import (dossier ou fichiers), réduction, stockage dans l'application
  // =====================================================================
  const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;
  let impGroups = [];
  const carnetGuess = f => { const dirs = String(f.webkitRelativePath || '').split('/').slice(0, -1).reverse(); for (const d of dirs) { const m = d.match(/\d{4,}/g); if (m) return m.sort((a, b) => b.length - a.length)[0]; } return ''; };
  function openImport(folder) {
    const inp = $('imgPick'); inp.value = '';
    if (folder) inp.setAttribute('webkitdirectory', ''); else inp.removeAttribute('webkitdirectory');
    inp.click();
  }
  $('imgPick').onchange = () => prepareImport([...$('imgPick').files]);
  function prepareImport(files) {
    const imgs = files.filter(f => IMG_RE.test(f.name) || /^image\//.test(f.type));
    if (!imgs.length) return toast('Aucune image trouvée dans ce choix.');
    const m = new Map();
    imgs.forEach(f => { const rel = String(f.webkitRelativePath || ''); const dir = rel.split('/').slice(0, -1).join('/'); if (!m.has(dir)) m.set(dir, []); m.get(dir).push(f); });
    impGroups = [...m.entries()].map(([dir, fl]) => ({ dir, files: fl, num: carnetGuess(fl[0]) || (dir === '' ? carnetNum : '') }));
    const box = $('impList'); box.innerHTML = '';
    impGroups.forEach((g, i) => {
      const lab = document.createElement('div'); lab.textContent = (g.dir || '(sélection de fichiers)') + ' — ' + g.files.length + ' image(s)'; lab.style.wordBreak = 'break-all';
      const inp = document.createElement('input'); inp.type = 'text'; inp.inputMode = 'numeric'; inp.placeholder = 'n° carnet'; inp.value = g.num; inp.dataset.i = i;
      const row = document.createElement('div'); row.className = 'ig'; row.appendChild(lab); row.appendChild(inp); box.appendChild(row);
    });
    $('impProg').textContent = ''; $('impGo').disabled = false;
    $('impOv').classList.add('open');
  }
  async function shrink(file) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(bmp, 0, 0, w, h); if (bmp.close) bmp.close();
      const b = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
      return b || file;
    } catch (e) { return file; }
  }
  $('impGo').onclick = async () => {
    const nums = [...$('impList').querySelectorAll('input')].map(i => i.value.replace(/\D/g, ''));
    if (nums.some(n => !n)) return ($('impProg').textContent = 'Indiquez le n° de carnet de chaque dossier.');
    $('impGo').disabled = true;
    const total = impGroups.reduce((a, g) => a + g.files.length, 0); let done = 0, first = '';
    for (let gi = 0; gi < impGroups.length; gi++) {
      const num = nums[gi]; first = first || num;
      for (const f of impGroups[gi].files) {
        $('impProg').textContent = 'Import… ' + (++done) + ' / ' + total + '  (carnet ' + num + ')';
        const blob = await shrink(f);
        await ST.putImg(num + '|' + f.name, { name: f.name, blob });
      }
    }
    $('impOv').classList.remove('open');
    toast('✔ ' + total + ' image(s) importée(s).');
    await loadCarnetList();
    if (first) { $('carnetNum').value = ''; await loadCarnet(carnetNum && nums.includes(carnetNum) ? carnetNum : first, ''); }
  };
  $('impCancel').onclick = $('impX').onclick = () => $('impOv').classList.remove('open');

  // =====================================================================
  // Images : liste, couverture, affichage
  // =====================================================================
  function splitCovers(names) {
    const isCover = n => COVER_WORDS.test(n);
    const lens = {};
    names.forEach(n => { const d = baseNumber(n); if (d && !isCover(n)) lens[d.length] = (lens[d.length] || 0) + 1; });
    let bestLen = 0, best = 0;
    Object.keys(lens).forEach(l => { if (lens[l] > best) { best = lens[l]; bestLen = +l; } });
    const strong = best >= 2 && best >= names.length * 0.5;
    const p = [], c = [];
    names.forEach(n => { const d = baseNumber(n); if (isCover(n) || !d || (strong && d.length !== bestLen)) c.push(n); else p.push(n); });
    return p.length ? { pages: p, covers: c } : { pages: names, covers: [] };
  }
  function showMsg(text, bad, btnLabel, btnFn) {
    $('msg').style.display = 'flex'; $('msg').className = bad ? 'bad' : '';
    $('msgText').textContent = text;
    const b = $('msgBtn');
    if (btnLabel) { b.style.display = ''; b.textContent = btnLabel; b.onclick = btnFn; } else { b.style.display = 'none'; b.onclick = null; }
    $('img').style.display = 'none';
  }
  const hideMsg = () => { $('msg').style.display = 'none'; $('img').style.display = 'block'; };

  async function loadCarnet(num, rel, target) {
    carnetNum = String(num || '').replace(/\D/g, ''); carnetRel = rel || '';
    $('carnetRO').value = carnetNum;
    pages = []; handles = new Map(); idx = -1; shownName = '';
    await ST.set({ hoLast: { stage, user, carnetNum, carnetRel } });
    await loadRecs();
    clearForm(true);
    $('cnt').textContent = ''; $('fname').textContent = ''; $('where').textContent = '';
    if (!carnetNum) return showMsg('Choisissez un carnet (📚) ou tapez son numéro.');
    { const p0 = ((await ST.get('hoPos')).hoPos || {})[carnetNum]; if (p0) { setNumber(p0); loadFormFor(p0); } }
    const keys = (await ST.imgKeys(carnetNum + '|')).map(k => String(k).slice(carnetNum.length + 1));
    if (!keys.length) { renderRecs(); return showMsg('Aucune image pour le carnet n° ' + carnetNum + '.\nImportez le dossier des images (☰ Menu).\nVous pouvez saisir quand même (tapez le n° de feuille).', true, '📥 Importer des images', () => openImport(false)); }
    keys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    const sp = splitCovers(keys);
    keys.forEach(n => handles.set(n, { getFile: async () => { const r = await ST.getImg(carnetNum + '|' + n); return r.blob; } }));
    pages = sp.pages;
    $('where').textContent = sp.covers.length ? 'couverture ignorée : ' + sp.covers.join(', ') : '';
    renderRecs();
    const posAll = (await ST.get('hoPos')).hoPos || {};
    const want = target || posAll[carnetNum];
    let first = -1;
    if (want) {
      first = pages.findIndex(n => stripZ(baseNumber(n)) === stripZ(want));
      if (first >= 0 && !target && recs.has(stripZ(want))) { const nx = pages.findIndex((n, k) => k > first && !recs.has(stripZ(baseNumber(n)))); first = nx >= 0 ? nx : first; }
    }
    if (first < 0) first = pages.findIndex(n => !recs.has(stripZ(baseNumber(n))));
    if (first < 0) first = 0;
    await showIndex(first, 'open');
  }

  let posT = null;
  function savePos(n) {
    if (!carnetNum || !n) return;
    clearTimeout(posT);
    posT = setTimeout(async () => { try { const o = (await ST.get('hoPos')).hoPos || {}; o[carnetNum] = String(n); await ST.set({ hoPos: o }); } catch (e) { /* ignore */ } }, 250);
  }
  async function showIndex(i, mode) {
    if (i < 0 || i >= pages.length) return;
    idx = i;
    const name = pages[i];
    savePos(baseNumber(name));
    $('cnt').textContent = (i + 1) + ' / ' + pages.length;
    $('fname').textContent = name;
    if (mode !== 'manual') { setNumber(baseNumber(name)); loadFormFor(baseNumber(name)); }
    renderRecs();
    const file = await handles.get(name).getFile();
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    imgUrl = URL.createObjectURL(file);
    const img = $('img');
    const rm = ((await ST.get('hoRot')).hoRot || {})[carnetNum + '|' + name];
    manualRot = rm == null ? null : rm; rot = manualRot == null ? 0 : manualRot;
    img.onload = () => { if (manualRot == null) rot = img.naturalWidth > img.naturalHeight ? 90 : 0; hideMsg(); layout(); $('stage').scrollTop = 0; };
    img.onerror = () => showMsg('Impossible d\'afficher « ' + name + ' ».', true);
    img.src = imgUrl; shownName = name;
  }
  function setNumber(n) { $('numeroLigneInput').value = n; lastNum = n; }

  function layout() {
    const img = $('img'), stageEl = $('stage'), box = $('box');
    if (!img.naturalWidth) return;
    const cw = stageEl.clientWidth, swap = rot === 90 || rot === 270;
    const sw = swap ? img.naturalHeight : img.naturalWidth, sh = swap ? img.naturalWidth : img.naturalHeight;
    const scale = (cw / sw) * zoom;
    box.style.width = Math.round(sw * scale) + 'px'; box.style.height = Math.round(sh * scale) + 'px';
    img.style.width = img.naturalWidth + 'px'; img.style.height = img.naturalHeight + 'px';
    img.style.transform = 'translate(-50%,-50%) rotate(' + rot + 'deg) scale(' + scale + ')';
  }
  new ResizeObserver(layout).observe($('stage'));
  function setZoom(z) {
    const st = $('stage'), box = $('box');
    const fy = (st.scrollTop + st.clientHeight / 2) / (box.offsetHeight || 1), fx = (st.scrollLeft + st.clientWidth / 2) / (box.offsetWidth || 1);
    zoom = Math.min(6, Math.max(0.4, z)); layout();
    st.scrollTop = fy * box.offsetHeight - st.clientHeight / 2; st.scrollLeft = fx * box.offsetWidth - st.clientWidth / 2;
  }
  async function rotate(d) {
    if (!shownName) return;
    rot = (rot + d + 360) % 360; manualRot = rot;
    const r = (await ST.get('hoRot')).hoRot || {}; r[carnetNum + '|' + shownName] = rot; await ST.set({ hoRot: r });
    layout();
  }
  $('stage').addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
  let pinch = null;
  $('stage').addEventListener('touchstart', e => { if (e.touches.length === 2) { const a = e.touches[0], b = e.touches[1]; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: zoom }; } }, { passive: true });
  $('stage').addEventListener('touchmove', e => { if (pinch && e.touches.length === 2) { e.preventDefault(); const a = e.touches[0], b = e.touches[1]; setZoom(pinch.z * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.d); } }, { passive: false });
  $('stage').addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; }, { passive: true });
  $('stage').addEventListener('dblclick', () => setZoom(1));

  async function step(d) {
    if (!pages.length) return;
    if (!(await confirmLeave())) return;
    const n = idx + d;
    if (n < 0 || n >= pages.length) return;
    zoom = 1;
    await showIndex(n, 'advance');
  }
  $('prev').onclick = () => step(-1); $('next').onclick = () => step(1);
  $('rotL').onclick = () => rotate(-90); $('rotR').onclick = () => rotate(90);
  $('zoomIn').onclick = () => setZoom(zoom * 1.25); $('zoomOut').onclick = () => setZoom(zoom / 1.25); $('fit').onclick = () => setZoom(1);
  let follow = true;
  $('follow').onclick = () => { follow = !follow; $('follow').classList.toggle('on', follow); };

  // image qui défile selon le champ en cours
  function trackedFields() {
    const all = [...$('f').querySelectorAll('input,select')].filter(el => el.type !== 'hidden' && !el.disabled && !el.readOnly && el.offsetParent !== null);
    const start = all.findIndex(el => el.id === 'nomElect');
    return start >= 0 ? all.slice(start) : all;
  }
  $('f').addEventListener('focusin', e => {
    if (!follow) return;
    const el = e.target, st = $('stage'), max = st.scrollHeight - st.clientHeight;
    if (max <= 0 || !el || !el.matches || !el.matches('input,select')) return;
    let f = 0;
    if (el.id !== 'numeroLigneInput' && el.id !== 'marquageInput') {
      const list = trackedFields(), i = list.indexOf(el);
      if (i < 0) return;
      f = list.length > 1 ? i / (list.length - 1) : 0;
    }
    st.scrollTo({ top: Math.round(Math.min(1, Math.max(0, f)) * max), behavior: 'smooth' });
  });

  // Le champ en cours d'édition reste un peu SOUS le centre du formulaire (au clavier : Tab / Entrée).
  // Ne concerne que cette page : la page du serveur et l'extension de suivi de la saisie 1 ne sont pas touchées.
  let kbAt = 0;
  document.addEventListener('keydown', e => { if (e.key === 'Tab' || e.key === 'Enter') kbAt = Date.now(); }, true);
  $('f').addEventListener('focusin', e => {
    const t = e.target;
    if (!t || !t.matches || !t.matches('input,select') || Date.now() - kbAt > 400) return;
    const pane = $('left'), pr = pane.getBoundingClientRect(), r = t.getBoundingClientRect();
    const want = pane.scrollTop + (r.top - pr.top) + r.height / 2 - pr.height * 0.58;   // 58 % de la hauteur : un peu sous le centre
    pane.scrollTo({ top: Math.max(0, Math.round(want)), behavior: 'smooth' });
  });

  // =====================================================================
  // Formulaire : mêmes règles que la page du serveur
  // =====================================================================
  const el = id => $(id);
  const capWords = v => v.split(' ').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w).join(' ');
  function formatNom(v) {
    const w = v.split(' ');
    if (w.length) {
      w[0] = w[0].toUpperCase();
      for (let i = 1; i < w.length; i++) {
        if (!w[i]) continue;
        const l = w[i].toLowerCase();
        w[i] = (l === '(feu)' || l === '(f)') ? '(Feu)' : l === '(feue)' ? '(Feue)' : w[i].charAt(0).toUpperCase() + w[i].slice(1).toLowerCase();
      }
    }
    return w.join(' ');
  }
  function feuDisplay(input, isFeu, suffix) {
    const cleaned = input.value.replace(/\s*\((Feu|Feue|FEU|FEUE|F|f)\)/gi, '').trim();
    if (isFeu) { if (cleaned && cleaned !== 'PI' && cleaned !== 'MI') input.value = cleaned + ' ' + suffix; } else input.value = cleaned;
  }
  const validDate = s => {
    if (!s) return true;
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return false;
    const [d, m, y] = s.split('/').map(Number);
    if (y < 1900 || y > 2099 || m === 0 || m > 12) return false;
    const ml = [31, (y % 400 === 0 || (y % 100 !== 0 && y % 4 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d > 0 && d <= ml[m - 1];
  };
  function wireForm() {
    document.querySelectorAll('#f [data-up]').forEach(i => i.addEventListener('input', () => { i.value = i.value.toUpperCase(); }));
    document.querySelectorAll('#f [data-sp]').forEach(i => i.addEventListener('input', () => {
      i.value = i.value.replace(/([A-Za-zÀ-ÿ])([0-9])/g, '$1 $2').replace(/([0-9])([A-Za-zÀ-ÿ])/g, '$1 $2').replace(/  +/g, ' ');
    }));
    el('prenomElect').addEventListener('input', function () {
      this.value = capWords(this.value.replace(/[^A-Za-z\s\-'çïéèêëàäüûùöôÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/g, '').replace(/\s+/g, ' '));
    });
    ['nomPereElect', 'nomMereElect'].forEach(id => {
      const i = el(id);
      i.addEventListener('keydown', e => { if (!(e.ctrlKey || e.metaKey || e.altKey) && /^[0-9]$/.test(e.key)) e.preventDefault(); });
      i.addEventListener('input', function () {
        if (this.disabled) return;
        this.value = formatNom(this.value.replace(/[^A-Za-z\s\-'çïéèêëàäüûùöôÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ()]/g, '').replace(/\s+/g, ' '));
      });
    });
    // exclusion date de naissance / né(e) vers
    el('dateNaiss').addEventListener('input', function () {
      let v = this.value.replace(/\D/g, '');
      if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
      if (v.length > 5) v = v.slice(0, 5) + '/' + v.slice(5);
      this.value = v.slice(0, 10);
      if (this.value.trim()) { el('neversElect').value = ''; el('neversElect').disabled = true; } else el('neversElect').disabled = false;
    });
    el('neversElect').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '');
      if (this.value.trim()) { el('dateNaiss').value = ''; el('dateNaiss').disabled = true; } else el('dateNaiss').disabled = false;
    });
    ['dateDeliv', 'dRecensement'].forEach(id => el(id).addEventListener('input', function () {
      let v = this.value.replace(/\D/g, '');
      if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
      if (v.length > 5) v = v.slice(0, 5) + '/' + v.slice(5);
      this.value = v.slice(0, 10);
    }));
    ['dateNaiss', 'dateDeliv', 'dRecensement'].forEach(id => el(id).addEventListener('blur', function () {
      if (this.value && !validDate(this.value)) { saveMsg('Date invalide (' + this.value + ') : utilisez JJ/MM/AAAA.', 'bad'); this.value = ''; if (id === 'dateNaiss') el('neversElect').disabled = false; }
    }));
    el('cinElect').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').substring(0, 12); });
    el('marquageInput').addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });
    // Feu / PI / Feue / MI
    el('feuPere').addEventListener('change', function () {
      if (this.checked) { el('piPere').checked = false; el('nomPereElect').disabled = false; if (el('nomPereElect').value === 'PI') el('nomPereElect').value = ''; feuDisplay(el('nomPereElect'), true, '(Feu)'); }
      else feuDisplay(el('nomPereElect'), false, '(Feu)');
    });
    el('piPere').addEventListener('change', function () {
      if (this.checked) { el('feuPere').checked = false; el('nomPereElect').value = 'PI'; el('nomPereElect').disabled = true; }
      else { el('nomPereElect').disabled = false; if (el('nomPereElect').value === 'PI') el('nomPereElect').value = ''; }
    });
    el('nomPereElect').addEventListener('blur', function () { if (el('feuPere').checked) feuDisplay(this, true, '(Feu)'); });
    el('feueMere').addEventListener('change', function () {
      if (this.checked) { el('miMere').checked = false; el('nomMereElect').disabled = false; if (el('nomMereElect').value === 'MI') el('nomMereElect').value = ''; feuDisplay(el('nomMereElect'), true, '(Feue)'); }
      else feuDisplay(el('nomMereElect'), false, '(Feue)');
    });
    el('miMere').addEventListener('change', function () {
      if (this.checked) { el('feueMere').checked = false; el('nomMereElect').value = 'MI'; el('nomMereElect').disabled = true; }
      else { el('nomMereElect').disabled = false; if (el('nomMereElect').value === 'MI') el('nomMereElect').value = ''; }
    });
    el('nomMereElect').addEventListener('blur', function () { if (el('feueMere').checked) feuDisplay(this, true, '(Feue)'); });
    el('professionSans').addEventListener('change', function () {
      if (this.checked) { el('professionElect').value = 'Sans profession'; el('professionElect').disabled = true; }
      else { el('professionElect').value = ''; el('professionElect').disabled = false; }
    });
    // Entrée -> champ suivant ; Ctrl+Entrée -> enregistrer
    SEQ.forEach(entry => {
      const id = typeof entry === 'string' ? entry : entry.id, e0 = el(id);
      e0.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault(); ev.stopPropagation();
        if (ev.ctrlKey) return saveRec();
        if (typeof entry !== 'string' && entry.radio) { e0.checked = true; e0.dispatchEvent(new Event('change', { bubbles: true })); }
        const i = SEQ.findIndex(x => (typeof x === 'string' ? x : x.id) === id);
        for (let k = i + 1; k < SEQ.length; k++) {
          const n = el(typeof SEQ[k] === 'string' ? SEQ[k] : SEQ[k].id);
          if (n && !n.disabled && n.offsetParent !== null) { n.focus(); return; }
        }
        $('save').focus();
      });
    });
    el('f').addEventListener('input', e => { if (e.isTrusted) dirty = true; });
    el('f').addEventListener('change', e => { if (e.isTrusted) dirty = true; });
    el('anomalieCheckbox').addEventListener('change', function () { $('save').textContent = this.checked ? '💾 Enregistrer en tant qu\'anomalie (hors ligne)' : '💾 Enregistrer (hors ligne)'; });
  }

  function captureState() {
    const vals = {}, checks = {}, disabled = {};
    IDS.forEach(id => { vals[id] = el(id).value; if (el(id).disabled) disabled[id] = true; });
    CHECKS.forEach(id => { checks[id] = el(id).checked; });
    return { vals, checks, disabled, sexe: el('sexeLahy').checked ? 'LAHY' : el('sexeVavy').checked ? 'VAVY' : '' };
  }
  function restoreState(d) {
    const vals = (d && d.vals) || {}, checks = (d && d.checks) || {}, dis = (d && d.disabled) || {};
    IDS.forEach(id => { el(id).value = vals[id] == null ? '' : vals[id]; el(id).disabled = !!dis[id]; });
    CHECKS.forEach(id => { el(id).checked = !!checks[id]; });
    el('sexeLahy').checked = !!d && d.sexe === 'LAHY'; el('sexeVavy').checked = !!d && d.sexe === 'VAVY';
    el('anomalieCheckbox').dispatchEvent(new Event('change'));
  }
  function clearForm(keepNumber) {
    restoreState(null);
    if (!keepNumber) { $('numeroLigneInput').value = ''; lastNum = ''; }
    dirty = false;
  }
  let lastNum = '';
  function loadFormFor(n) {
    const r = recs.get(stripZ(n));
    if (r && r.rec.bad) { restoreState(null); dirty = false; saveMsg('🚫 Feuillet ' + n + ' inexploitable : ' + r.rec.bad.motif + (r.rec.bad.remarque ? ' (' + r.rec.bad.remarque + ')' : '') + (r.rec.sent ? ' — déjà envoyé au serveur.' : ' — sera proposé au serveur.'), 'wr'); return; }
    if (r) { restoreState(r.rec.data); saveMsg('Feuillet ' + n + ' : saisie hors ligne chargée' + (r.rec.sent ? ' (déjà envoyée au serveur le ' + fmt(r.rec.sentAt) + ')' : '') + '.', r.rec.sent ? 'wr' : 'ok'); }
    else { restoreState(null); saveMsg(''); }
    dirty = false;
  }
  async function confirmLeave() {
    if (!dirty) return true;
    return confirm('Une saisie est en cours, non enregistrée. L\'abandonner ?');
  }
  function saveMsg(t, cls) { const m = $('saveMsg'); m.textContent = t || ''; m.className = cls || ''; }

  // ---------- enregistrer / supprimer ----------
  function validateRec() {
    const ano = el('anomalieCheckbox').checked;
    const miss = [];
    if (!stripZ($('numeroLigneInput').value.replace(/\D/g, ''))) miss.push('numéro feuillet');
    if (!ano) {
      const req = [['nomElect', 'nom'], ['lieuNaiss', 'lieu de naissance'], ['nomPereElect', 'nom du père'], ['nomMereElect', 'nom de la mère'], ['adresseElect', 'adresse'],
        ['professionElect', 'profession'], ['cinElect', 'CIN'], ['dateDeliv', 'date de délivrance'], ['lieuDeliv', 'lieu de délivrance'], ['dRecensement', 'date du recensement'], ['Observation', 'observation']];
      req.forEach(([id, l]) => { if (!String(el(id).value).trim()) miss.push(l); });
      if (!el('sexeLahy').checked && !el('sexeVavy').checked) miss.push('sexe');
      if (!el('dateNaiss').value.trim() && !el('neversElect').value.trim()) miss.push('date de naissance ou né(e) vers');
    }
    return miss;
  }
  async function saveRec() {
    const n = $('numeroLigneInput').value.replace(/\D/g, '');
    if (!carnetNum) return saveMsg('Choisissez d\'abord un carnet.', 'bad');
    const miss = validateRec();
    if (miss.length) return saveMsg('À compléter : ' + miss.join(', ') + '.', 'bad');
    const key = recKey(stage, carnetNum, n);
    const old = recs.get(stripZ(n));
    if (old && old.rec.sent && !confirm('Ce feuillet a déjà été ENVOYÉ au serveur le ' + fmt(old.rec.sentAt) + '. Remplacer la saisie hors ligne (elle sera de nouveau « en attente ») ?')) return;
    if (old && !old.rec.sent && !dirty && JSON.stringify(old.rec.data) === JSON.stringify(captureState())) { /* inchangé */ }
    const rec = { v: 1, stage, user, carnetNum, carnetRel, feuillet: n, data: captureState(), savedAt: Date.now(), sent: false };
    await ST.set({ [key]: rec });
    recs.set(stripZ(n), { key, rec });
    dirty = false;
    saveMsg('✔ Feuillet ' + n + ' enregistré hors ligne.', 'ok');
    renderRecs();
    await advanceAfterSave(n, '✔ Feuillet ' + n + ' enregistré hors ligne.');
  }
  async function advanceAfterSave(n, okMsg) {
    // feuillet suivant : prochaine image sans saisie, sinon image suivante
    if (pages.length) {
      let nx = -1;
      for (let k = idx + 1; k < pages.length; k++) if (!recs.has(stripZ(baseNumber(pages[k])))) { nx = k; break; }
      if (nx < 0 && idx + 1 < pages.length) nx = idx + 1;
      if (nx >= 0) { zoom = 1; await showIndex(nx, 'advance'); saveMsg(okMsg, 'ok'); }
      else { clearForm(false); showMsg('Dernier feuillet enregistré : ce carnet est terminé hors ligne. Pensez à exporter (⬇).'); }
    } else { clearForm(false); $('numeroLigneInput').focus(); }
    $('numeroLigneInput').focus();
  }
  // feuillet inexploitable
  const badOpen = o => { $('badBox').classList.toggle('open', o); if (o) { $('badMotif').focus(); } };
  $('bad').onclick = () => {
    const n = $('numeroLigneInput').value.replace(/\D/g, '');
    if (!carnetNum) return saveMsg('Choisissez d\'abord un carnet.', 'bad');
    if (!n) { saveMsg('Saisissez d\'abord le numéro du feuillet inexploitable.', 'bad'); return $('numeroLigneInput').focus(); }
    badOpen(!$('badBox').classList.contains('open'));
  };
  $('badCancel').onclick = () => badOpen(false);
  $('badOk').onclick = async () => {
    const n = $('numeroLigneInput').value.replace(/\D/g, '');
    const motif = $('badMotif').value, remarque = $('badRem').value.trim();
    if (!/^\d{1,12}$/.test(n)) return saveMsg('Numéro de feuillet requis.', 'bad');
    if (!motif) return saveMsg('Veuillez choisir un motif.', 'bad');
    if (motif === 'autre' && !remarque) return saveMsg('Veuillez préciser la remarque (motif « Autre »).', 'bad');
    const key = recKey(stage, carnetNum, n), old = recs.get(stripZ(n));
    if (old && old.rec.sent && !confirm('Ce feuillet a déjà été ENVOYÉ au serveur. Le remplacer par « inexploitable » ?')) return;
    if (old && !old.rec.bad && !old.rec.sent && !confirm('Ce feuillet a déjà une saisie hors ligne. La remplacer par « inexploitable » ?')) return;
    const rec = { v: 1, stage, user, carnetNum, carnetRel, feuillet: n, data: { vals: {}, checks: {}, disabled: {}, sexe: '' }, bad: { motif, remarque }, savedAt: Date.now(), sent: false };
    await ST.set({ [key]: rec });
    recs.set(stripZ(n), { key, rec });
    dirty = false; badOpen(false); $('badMotif').value = ''; $('badRem').value = '';
    renderRecs();
    await advanceAfterSave(n, '🚫 Feuillet ' + n + ' marqué inexploitable (' + motif + ') hors ligne.');
  };
  async function delRec() {
    const n = $('numeroLigneInput').value.replace(/\D/g, '');
    const r = recs.get(stripZ(n));
    if (!r) return saveMsg('Aucune saisie hors ligne pour ce n°.', 'bad');
    if (!confirm('Supprimer la saisie hors ligne du feuillet ' + n + ' ?')) return;
    await ST.remove(r.key); recs.delete(stripZ(n)); clearForm(true); renderRecs(); saveMsg('Feuillet ' + n + ' supprimé.', 'ok');
  }
  $('save').onclick = saveRec; $('del').onclick = delRec;
  $('clear').onclick = async () => { if (await confirmLeave()) { restoreState(null); dirty = false; saveMsg(''); } };

  // ---------- liste des feuillets ----------
  function renderRecs() {
    const box = $('recs');
    box.innerHTML = '';
    const cur = stripZ($('numeroLigneInput').value.replace(/\D/g, ''));
    const all = [];
    pages.forEach(n => all.push({ n: baseNumber(n), img: true }));
    recs.forEach(({ rec }) => { if (!all.some(x => stripZ(x.n) === stripZ(rec.feuillet))) all.push({ n: rec.feuillet, img: false }); });
    all.sort((a, b) => Number(stripZ(a.n)) - Number(stripZ(b.n)));
    const done = [...recs.values()].length, sent = [...recs.values()].filter(x => x.rec.sent).length;
    const h = document.createElement('span');
    h.textContent = carnetNum ? 'Carnet ' + carnetNum + ' · ' + done + (pages.length ? ' / ' + pages.length : '') + ' saisi(s) · ' + sent + ' envoyé(s)' : '';
    h.style.marginRight = '8px'; box.appendChild(h);
    all.forEach(x => {
      const r = recs.get(stripZ(x.n));
      const c = document.createElement('span');
      const warn = r && r.rec.srv && r.rec.srv.exists && !r.rec.sent;
      c.className = 'c' + (!r ? ' todo' : r.rec.bad ? ' bad' : r.rec.sent ? ' sent' : warn ? ' warn' : '') + (cur && cur === stripZ(x.n) ? ' cur' : '');
      c.textContent = (r ? (r.rec.bad ? '🚫 ' : r.rec.sent ? '✓ ' : warn ? '⚠ ' : '● ') : '○ ') + x.n;
      c.title = !r ? 'À saisir' : r.rec.sent ? 'Envoyé le ' + fmt(r.rec.sentAt) : warn ? 'Le serveur dit : ' + (r.rec.srv.msg || 'déjà traité') : 'Saisi le ' + fmt(r.rec.savedAt);
      c.onclick = async () => { if (await confirmLeave()) goNumber(x.n); };
      box.appendChild(c);
    });
  }
  async function goNumber(n) {
    const i = pages.findIndex(p => stripZ(baseNumber(p)) === stripZ(n));
    if (i >= 0) { zoom = 1; return showIndex(i, 'advance'); }
    setNumber(n); loadFormFor(n); renderRecs();
    if (pages.length) { $('cnt').textContent = 'n° ' + n; $('fname').textContent = ''; showMsg(NO_IMG, true); }
  }

  // n° de feuillet tapé à la main -> image correspondante
  function onNumberInput(force) {
    const v = $('numeroLigneInput').value.replace(/\D/g, '');
    if (v === lastNum && !force) return;
    lastNum = v;
    clearTimeout(numT);
    numT = setTimeout(async () => {
      if (!v) return;
      savePos(v);
      const i = pages.findIndex(p => baseNumber(p) === v || stripZ(baseNumber(p)) === stripZ(v));
      if (i >= 0) {
        if (i !== idx || $('img').style.display === 'none') { zoom = 1; await showIndex(i, 'manual'); }
        else $('cnt').textContent = (i + 1) + ' / ' + pages.length;
        const r = recs.get(stripZ(v));
        if (r && !dirty) loadFormFor(v);
        else if (!r && !dirty) saveMsg('');
      } else if (!pages.length) {
        const r = recs.get(stripZ(v));
        const empty = !$('nomElect').value && !$('lieuNaiss').value && !$('cinElect').value;
        if (r && (!dirty || empty)) loadFormFor(v); else if (!r && !dirty) saveMsg('');
      } else if (pages.length && (force || v.length >= Math.max(4, pages[0] ? baseNumber(pages[0]).length : 4))) {
        $('cnt').textContent = 'n° ' + v; $('fname').textContent = ''; showMsg(NO_IMG, true);
      }
      renderRecs();
    }, force ? 0 : 350);
  }
  $('numeroLigneInput').addEventListener('input', () => onNumberInput(false));
  $('numeroLigneInput').addEventListener('change', () => onNumberInput(true));
  $('numeroLigneInput').addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });

  // raccourcis
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); return saveRec(); }
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const k = (e.key || '').toLowerCase();
    if (k === 'n') step(1); else if (k === 'p') step(-1); else if (k === 'r') rotate(e.shiftKey ? -90 : 90); else return;
    e.preventDefault();
  }, true);

  // =====================================================================
  // Export / import
  // =====================================================================
  async function exportAll(share) {
    const all = await ST.get(null);
    const out = { format: 'ceni-hors-ligne', v: 1, exportedAt: Date.now(), records: [], carnets: {}, stages: {}, lastUser: all.hoLastUser || '' };
    Object.keys(all).forEach(k => {
      if (k.startsWith('rec|')) out.records.push(all[k]);
      else if (k.startsWith('carnets|')) out.carnets[k.slice(8)] = all[k];
      else if (k.startsWith('stage|')) out.stages[k.slice(6)] = all[k];
    });
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const fname = 'ceni-hors-ligne-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
    let shared = false;
    if (share) { try { const file = new File([blob], fname, { type: 'application/json' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: fname }); shared = true; } } catch (e) { if (e && e.name === 'AbortError') return; } }
    if (!shared) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }
    await ST.set({ hoExportAt: Date.now() }); loadCarnetList();
    toast('⬇ ' + out.records.length + ' feuille(s) exportée(s) dans un seul fichier.');
  }
  async function importFile(file) {
    let j;
    try { j = JSON.parse(await file.text()); } catch (e) { return alert('Fichier illisible.'); }
    if (!j || j.format !== 'ceni-hors-ligne' || !Array.isArray(j.records)) return alert('Ce fichier n\'est pas une sauvegarde « CENI Hors-ligne ».');
    const all = await ST.get(null);
    const upd = {};
    let added = 0, updated = 0, kept = 0;
    j.records.forEach(r => {
      if (!r || String(r.stage) !== '1' || !r.carnetNum || !r.feuillet) return;
      const key = recKey(r.stage, r.carnetNum, r.feuillet), cur = all[key];
      if (!cur) { upd[key] = r; added++; return; }
      if ((r.savedAt || 0) > (cur.savedAt || 0)) { const m = Object.assign({}, r); if (cur.sent && (cur.savedAt || 0) === (r.savedAt || 0)) m.sent = true; upd[key] = m; updated++; return; }
      if ((r.savedAt || 0) === (cur.savedAt || 0) && r.sent && !cur.sent) { upd[key] = Object.assign({}, cur, { sent: true, sentAt: r.sentAt }); updated++; return; }
      kept++;
    });
    Object.keys(j.carnets || {}).forEach(u => { const k = 'carnets|' + u; if (!all[k] || (j.carnets[u].at || 0) > (all[k].at || 0)) upd[k] = j.carnets[u]; });
    Object.keys(j.stages || {}).forEach(u => { if (!all['stage|' + u]) upd['stage|' + u] = j.stages[u]; });
    if (j.lastUser && !all.hoLastUser) upd.hoLastUser = j.lastUser;
    await ST.set(upd);
    alert('Import terminé : ' + added + ' ajoutée(s), ' + updated + ' mise(s) à jour, ' + kept + ' déjà à jour.');
    await loadUsers(); await loadCarnetList(); await loadRecs(); renderRecs();
  }
  $('impFile').onchange = () => { const f = $('impFile').files[0]; $('impFile').value = ''; if (f) importFile(f); };

  // =====================================================================
  // Barre du haut
  // =====================================================================
  $('stageSel').onchange = async () => { if (!(await confirmLeave())) { $('stageSel').value = stage; return; } stage = $('stageSel').value; await ST.set({ hoLast: { stage, user, carnetNum, carnetRel } }); await loadCarnetList(); if (carnetNum) await loadCarnet(carnetNum, carnetRel); };
  $('user').onchange = async () => { user = $('user').value.trim(); await loadCarnetList(); const all = await ST.get('stage|' + user);  await ST.set({ hoLast: { stage, user, carnetNum, carnetRel } }); };
  const goManual = async () => { const v = $('carnetNum').value.replace(/\D/g, ''); if (!v) return; if (!(await confirmLeave())) return; $('carnetSel').value = ''; await loadCarnet(v, ''); };
  $('carnetGo').onclick = goManual;
  $('carnetNum').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goManual(); } });

  // =====================================================================
  // Menu : synchro interne, export unique, effacement
  // =====================================================================
  let toastT = null;
  function toast(t) { const e = $('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => { e.style.display = 'none'; }, 3500); }
  const openMenu = async () => {
    const all = await ST.get(null); let est = '';
    try { const e = await navigator.storage.estimate(); est = ' · espace utilisé ' + Math.round((e.usage || 0) / 1048576) + ' Mo'; const p = navigator.storage.persisted ? await navigator.storage.persisted() : null; est += p === true ? ' · stockage protégé' : p === false ? ' · stockage non protégé (faites des exports)' : ''; } catch (e) { /* ignore */ }
    $('menuInfo').textContent = 'Dernière synchro interne : ' + (all.hoSyncAt ? fmt(all.hoSyncAt) : 'jamais') + ' · dernier export : ' + (all.hoExportAt ? fmt(all.hoExportAt) : 'jamais') + est;
    $('menuOv').classList.add('open');
  };
  $('menuBtn').onclick = openMenu; $('menuX').onclick = () => $('menuOv').classList.remove('open');
  const closeMenu = () => $('menuOv').classList.remove('open');
  $('viewerBtn').onclick = () => { $('viewer').classList.toggle('hid'); $('split').style.display = $('viewer').classList.contains('hid') ? 'none' : ''; };
  $('miFolder').onclick = () => { closeMenu(); openImport(true); };
  $('miFiles').onclick = () => { closeMenu(); openImport(false); };
  async function internalSync() {
    const all = await ST.get(null), records = Object.keys(all).filter(k => k.startsWith('rec|')).map(k => all[k]);
    await ST.set({ snapshot: { at: Date.now(), records }, hoSyncAt: Date.now() });
    const nc = new Set(records.map(r => r.carnetNum)).size, bad = records.filter(r => r.bad).length, ni = (await ST.imgKeys()).length;
    toast('✔ Synchro interne : ' + nc + ' carnet(s), ' + records.length + ' feuille(s)' + (bad ? ' (dont ' + bad + ' inexploitable)' : '') + ', ' + ni + ' image(s).');
  }
  $('miSync').onclick = async () => { closeMenu(); await internalSync(); };
  $('miRestore').onclick = async () => {
    const sn = (await ST.get('snapshot')).snapshot;
    if (!sn) return toast('Aucune synchro interne à restaurer.');
    if (!confirm('Restaurer la synchro du ' + fmt(sn.at) + ' (' + sn.records.length + ' feuille(s)) ?\n(Ce qui est plus récent est gardé.)')) return;
    const all = await ST.get(null), upd = {}; let n = 0;
    sn.records.forEach(r => { const k = recKey(r.stage, r.carnetNum, r.feuillet), c = all[k]; if (!c || (r.savedAt || 0) > (c.savedAt || 0)) { upd[k] = r; n++; } });
    await ST.set(upd); closeMenu(); await loadRecs(); renderRecs(); await loadCarnetList(); toast('♻ ' + n + ' feuille(s) restaurée(s).');
  };
  $('miExport').onclick = () => { closeMenu(); exportAll(false); };
  $('miShare').onclick = () => { closeMenu(); exportAll(true); };
  $('miImport').onclick = () => { closeMenu(); $('impFile').click(); };
  $('miClrSent').onclick = () => { closeMenu(); $('clrSent').onclick(); };
  async function clearAll(kind) {
    const lab = { recs: 'TOUTES les feuilles saisies', imgs: 'TOUTES les images', all: 'TOUT (saisies, images, réglages)' }[kind];
    if (!confirm('Effacer ' + lab + ' ?\nPensez à EXPORTER avant : c\'est définitif.')) return;
    if (!confirm('DERNIÈRE confirmation : effacer ' + lab + ' ?')) return;
    const all = await ST.get(null);
    if (kind === 'recs') await ST.remove(Object.keys(all).filter(k => k.startsWith('rec|') || k === 'hoPos' || k === 'snapshot'));
    else if (kind === 'imgs') await ST.clearImgs();
    else { await ST.clearKV(); await ST.clearImgs(); }
    closeMenu(); const keep = carnetNum; await loadCarnetList();
    if (keep && kind !== 'all') await loadCarnet(keep, ''); else { carnetNum = ''; pages = []; recs = new Map(); clearForm(false); renderRecs(); showMsg('Tout est vide. ☰ Menu → Importer des images.'); }
    toast('🗑 Effacé.');
  }
  $('miClrRecs').onclick = () => clearAll('recs'); $('miClrImgs').onclick = () => clearAll('imgs'); $('miClrAll').onclick = () => clearAll('all');
  // séparateur image / formulaire (glisser)
  (() => {
    const sp = $('split'); let y0 = 0, h0 = 0, on = false;
    try { const v = localStorage.getItem('ho-imgh'); if (v) document.documentElement.style.setProperty('--imgh', v); } catch (e) { /* ignore */ }
    sp.addEventListener('pointerdown', e => { on = true; y0 = e.clientY; h0 = $('viewer').getBoundingClientRect().height; sp.setPointerCapture(e.pointerId); });
    sp.addEventListener('pointermove', e => { if (!on) return; const H = document.body.getBoundingClientRect().height; const h = Math.max(90, Math.min(H * 0.8, h0 + e.clientY - y0)); document.documentElement.style.setProperty('--imgh', h + 'px'); });
    const end = () => { if (!on) return; on = false; try { localStorage.setItem('ho-imgh', getComputedStyle(document.documentElement).getPropertyValue('--imgh')); } catch (e) { /* ignore */ } };
    sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end);
  })();
  // hauteur utile (clavier) pour les navigateurs qui ne redimensionnent pas la page
  const setH = () => document.documentElement.style.setProperty('--app-h', (window.visualViewport ? visualViewport.height : innerHeight) + 'px');
  if (window.visualViewport) visualViewport.addEventListener('resize', setH); setH();
  window.addEventListener('scroll', () => { if (window.scrollY || window.scrollX) window.scrollTo(0, 0); }, true);
  // ---------- démarrage ----------
  (async () => {
    wireForm();
    const all = await loadUsers();
    const last = all.hoLast || {};
    stage = '1'; user = '';
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
    await loadCarnetList();
    if (last.carnetNum) await loadCarnet(last.carnetNum, '');
    else showMsg('Bienvenue. ☰ Menu → « Importer des images » (le dossier de vos carnets), puis ouvrez un carnet avec 📚.');
  })();
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* ignore */ });
})();
