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
    const get = n => { if (!m.has(n)) m.set(n, { num: n, rel: '', label: '', rest: NaN, feuilles: [], nimg: 0, names: [] }); return m.get(n); };
    (await ST.imgKeys()).forEach(k => { const n = String(k).split('|')[0]; if (n) { get(n).nimg++; get(n).names.push(String(k).slice(n.length + 1)); } });
    Object.keys(all).filter(k => k.startsWith('rec|1|')).forEach(k => { const r = all[k]; get(String(r.carnetNum)).feuilles.push({ key: k, rec: r }); });
    m.forEach(c => {
      const have = new Set(c.feuilles.map(f => stripZ(f.rec.feuillet)));
      const pg = c.names.length ? splitCovers(c.names).pages : [];
      c.todo = pg.filter(p => !have.has(stripZ(baseNumber(p)))).length; c.npages = pg.length;
      c.done = (pg.length > 0 && c.todo === 0) || c.rest === 0;
    });
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
  let carnetTab = 'todo';
  async function renderCarnets() {
    const idxAll = await carnetIndex(), at = idxAll.at;
    const nTodo = idxAll.list.filter(c => !c.done).length, nDone = idxAll.list.length - nTodo;
    const list = idxAll.list.filter(c => carnetTab === 'done' ? c.done : !c.done);
    let tb = $('carnetTabs');
    if (!tb) { tb = document.createElement('div'); tb.id = 'carnetTabs'; tb.style.cssText = 'display:flex;gap:6px;margin:0 0 8px'; $('carnetsList').parentNode.insertBefore(tb, $('carnetsList')); }
    tb.innerHTML = '';
    [['todo', '⏳ Mbola tsy vita (' + nTodo + ')'], ['done', '✅ Vita (' + nDone + ')']].forEach(([k, l]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = l; b.style.cssText = 'flex:1;padding:9px 4px;border-radius:8px;border:1px solid #888;font-weight:' + (carnetTab === k ? '700' : '400') + ';background:' + (carnetTab === k ? '#2a6df4' : 'transparent') + ';color:' + (carnetTab === k ? '#fff' : 'inherit'); b.onclick = () => { carnetTab = k; renderCarnets(); }; tb.appendChild(b); });
    $('carnetsInfo').textContent = at ? 'synchro du ' + fmt(at) : '';
    const box = $('carnetsList'); box.innerHTML = '';
    if (!list.length && idxAll.list.length) { box.innerHTML = '<div class="help">' + (carnetTab === 'done' ? 'Aucun carnet terminé pour le moment.' : '🎉 Tous les carnets sont terminés (onglet « Vita »).') + '</div>'; }
    else if (!list.length) { box.innerHTML = '<div class="help">Aucun carnet pour le moment. Sur la page du serveur, cliquez sur « Synchroniser » (panneau en bas à gauche), ou tapez un n° de carnet.</div>'; }
    list.forEach(c => {
      const sent = c.feuilles.filter(f => f.rec.sent).length, bad = c.feuilles.filter(f => f.rec.bad).length;
      const row = document.createElement('div'); row.className = 'cr' + (carnetNum === c.num ? ' open' : '');
      row.innerHTML = '<div class="t"><b></b><span class="st"></span><span class="sp"></span><button class="pri o">Ouvrir</button><button class="v">Feuillets ▾</button></div><div class="fl"></div>';
      row.querySelector('b').textContent = (c.done ? '✅ ' : '') + c.num + (c.label ? ' — ' + c.label : '');
      if (c.done) row.classList.add('done');
      row.querySelector('.st').textContent = (c.done ? 'VITA saisie · ' : c.npages ? c.todo + ' mbola tsy vita · ' : '') + (isNaN(c.rest) ? '' : c.rest + ' restant' + (c.rest > 1 ? 's' : '') + ' · ') + (c.nimg ? c.nimg + ' image(s) · ' : '') + c.feuilles.length + ' saisi(s) hors ligne · ' + sent + ' envoyé(s)' + (bad ? ' · ' + bad + ' inexploitable(s)' : '');
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
  $('miZip').onclick = () => { closeMenu(); $('zipPick').value = ''; $('zipPick').click(); };
  $('zipPick').onchange = async () => {
    const f = $('zipPick').files[0]; if (!f) return;
    try {
      toast('Lecture du ZIP…');
      const z = await JSZip.loadAsync(f), files = [];
      z.forEach((path, ent) => {
        if (ent.dir || !IMG_RE.test(path) || /(^|\/)__MACOSX\//.test(path) || /(^|\/)\._/.test(path)) return;
        const name = path.split('/').pop();
        files.push({ name, type: 'image/jpeg', webkitRelativePath: path, _entry: ent });
      });
      if (!files.length) return toast('Aucune image dans ce ZIP.');
      prepareImport(files);
    } catch (e) { toast('ZIP illisible : ' + (e && e.message || e)); }
  };
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
  // Photo -> image « utile » : redressée si couchée, coupée à la fin du taratasy (le bas inutile : couverture, tissu… est retiré)
  function paperBottom(cv) {
    const w = 160, h = Math.max(20, Math.round(cv.height * w / cv.width));
    const s = document.createElement('canvas'); s.width = w; s.height = h;
    const g = s.getContext('2d'); g.drawImage(cv, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, lum = new Float32Array(w * h), sat = new Float32Array(w * h), hist = new Uint32Array(256);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) { const r = d[i], gg = d[i + 1], b = d[i + 2]; const l = .299 * r + .587 * gg + .114 * b; lum[p] = l; sat[p] = Math.max(r, gg, b) - Math.min(r, gg, b); hist[l | 0]++; }
    let acc = 0, ref = 255; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= w * h * 0.75) { ref = v; break; } }
    const thr = ref * 0.82; let last = -1;
    for (let y = 0; y < h; y++) { let c = 0; for (let x = 0; x < w; x++) { const p = y * w + x; if (lum[p] > thr && sat[p] < 70) c++; } if (c > w * 0.5) last = y; }
    return last < 0 ? 1 : (last + 1) / h;
  }
  // Sens du texte : les lignes horizontales font varier fortement la somme d'encre par ligne ; couchée, c'est par colonne.
  // > 1,5 : photo couchée ; < 0,67 : photo droite ; entre les deux : on se fie aux dimensions.
  function textOrient(bmp) {
    try {
      const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height)), w = Math.max(20, Math.round(bmp.width * k)), h = Math.max(20, Math.round(bmp.height * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0, w, h);
      const x0 = Math.round(w * .1), x1 = Math.round(w * .9), y0 = Math.round(h * .1), y1 = Math.round(h * .9);
      const d = g.getImageData(0, 0, w, h).data, lum = new Float32Array(w * h), hist = new Uint32Array(256);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) { const l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; lum[p] = l; hist[l | 0]++; }
      let acc = 0, ref = 255; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= w * h * .75) { ref = v; break; } }
      const thr = ref * .7, rows = new Float32Array(h), cols = new Float32Array(w);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (lum[y * w + x] < thr) { rows[y]++; cols[x]++; }
      const cvOf = (a, s0, e0) => { let m = 0; for (let i = s0; i < e0; i++) m += a[i]; m /= (e0 - s0); let v = 0; for (let i = s0; i < e0; i++) v += (a[i] - m) ** 2; return m > 0 ? Math.sqrt(v / (e0 - s0)) / m : 0; };
      return cvOf(cols, x0, x1) / Math.max(cvOf(rows, y0, y1), 1e-6);
    } catch (e) { return 1; }
  }
  async function shrink(file) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const ro = textOrient(bmp);
      const turn = ro > 1.5 ? true : ro < 0.67 ? false : bmp.width > bmp.height;   // v1.4 : sens du texte d'abord, puis les dimensions
      const uw = turn ? bmp.height : bmp.width, uh = turn ? bmp.width : bmp.height;
      const k = Math.min(1, 2000 / Math.max(uw, uh)), cw = Math.round(uw * k), ch = Math.round(uh * k);
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const g = cv.getContext('2d');
      if (turn) { g.translate(cw, 0); g.rotate(Math.PI / 2); g.drawImage(bmp, 0, 0, ch, cw); } else g.drawImage(bmp, 0, 0, cw, ch);
      if (bmp.close) bmp.close();
      let out = cv; const pb = paperBottom(cv);
      if (false && pb < 0.92 && pb > 0.45) {         // v1.4 : plus de rognage automatique (il coupait le CIN, le n° de série et la date du recensement)           // sûr : on ne coupe que si la fin du taratasy est nette, jamais plus de 55 %
        const oh = Math.min(ch, Math.round(ch * (pb + 0.02)));
        const c2 = document.createElement('canvas'); c2.width = cw; c2.height = oh; c2.getContext('2d').drawImage(cv, 0, 0, cw, oh, 0, 0, cw, oh); out = c2;
      }
      const b = await new Promise(r => out.toBlob(r, 'image/jpeg', 0.82));
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
        const blob = await shrink(f._entry ? await f._entry.async('blob') : f);
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
    if (pages.length && pages.every(n => recs.has(stripZ(baseNumber(n))))) toast('✅ Carnet ' + carnetNum + ' : vita saisie ny feuillet rehetra (' + pages.length + ').');
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
    anchors.clear(); curTrack = '';
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
  const F0 = 0.2;
  // v1.6 : la position suit l'ORDRE FIXE des champs (STOPS), qu'ils soient actifs ou non : avant, les champs
  // désactivés (CIN…) n'étaient pas comptés, donc l'image arrivait au bas du papier bien avant la fin du formulaire.
  const FOLLOW_AL = { sexeLahy: '@sexe', sexeVavy: '@sexe', handicapElect: '@handicap', Observation: '@observation' };
  const followList = () => STOPS.slice(STOPS.indexOf('nomElect'));
  const followPos = id => followList().indexOf(FOLLOW_AL[id] || id);
  const F_END = 0.72;
  function followImg(el) {
    if (!follow) return;
    const st = $('stage'), max = st.scrollHeight - st.clientHeight;
    if (max <= 0 || !el || !el.matches || !el.matches('input,select')) return;
    let f = 0;
    if (el.id !== 'numeroLigneInput' && el.id !== 'marquageInput') {
      const i = followPos(el.id), n = followList().length;
      if (i < 0) return;
      curTrack = el.id;
      // points de calage : début (Nom) et fin du papier, plus les positions réglées à la main ;
      // entre deux points l'image défile en ligne droite, donc elle continue toute seule à partir de votre réglage
      const pts = [{ i: 0, f: F0 }, { i: Math.max(1, n - 1), f: F_END }];
      anchors.forEach((af, id) => { const k = followPos(id); if (k >= 0) { const q = pts.findIndex(x => x.i === k); if (q >= 0) pts[q].f = af; else pts.push({ i: k, f: af }); } });
      pts.sort((a, b) => a.i - b.i);
      f = pts[pts.length - 1].f;
      if (i <= pts[0].i) f = pts[0].f;
      else for (let k = 1; k < pts.length; k++) if (i <= pts[k].i) { const a = pts[k - 1], b = pts[k]; f = a.f + (b.f - a.f) * (i - a.i) / Math.max(1, b.i - a.i); break; }
    } else curTrack = '';
    progStart = Date.now(); progUntil = progStart + 900;
    st.scrollTo({ top: Math.round(Math.min(1, Math.max(0, f)) * max), behavior: 'smooth' });
  }
  // réglage manuel : si vous faites défiler l'image avec le doigt pendant qu'un champ est en cours, la position est mémorisée pour ce champ
  const anchors = new Map();      // id du champ -> position (0..1) de l'image, pour la feuille en cours
  let curTrack = '', progStart = 0, progUntil = 0, lastUser = 0, anchT = null;
  const userTouch = () => { lastUser = Date.now(); };
  ['touchstart', 'touchmove', 'touchend', 'wheel', 'pointerdown'].forEach(ev => $('stage').addEventListener(ev, userTouch, { passive: true }));
  $('stage').addEventListener('scroll', () => {
    const now = Date.now();
    if (!curTrack || now - lastUser > 1500 || (now < progUntil && lastUser < progStart)) return;
    clearTimeout(anchT);
    anchT = setTimeout(() => {
      const st = $('stage'), max = st.scrollHeight - st.clientHeight;
      if (max <= 0 || !curTrack) return;
      anchors.set(curTrack, Math.min(1, Math.max(0, st.scrollTop / max)));
      toast('📍 Position de l\'image réglée : la suite suit à partir d\'ici.');
    }, 450);
  }, { passive: true });
  $('f').addEventListener('focusin', e => followImg(e.target));

  // Le champ en cours d'édition reste un peu SOUS le centre du formulaire (au clavier : Tab / Entrée).
  // Ne concerne que cette page : la page du serveur et l'extension de suivi de la saisie 1 ne sont pas touchées.
  let kbAt = 0;
  document.addEventListener('keydown', e => { if (e.key === 'Tab' || e.key === 'Enter') kbAt = Date.now(); }, true);
  $('f').addEventListener('focusin', e => {
    const t = e.target;
    if (!t || !t.matches || !t.matches('input,select')) return;
    const kb = document.body.classList.contains('kb');
    if (!kb && Date.now() - kbAt > 400) return;
    const pane = $('left'), pr = pane.getBoundingClientRect(), r = t.getBoundingClientRect();
    // clavier ouvert : le champ monte tout près de l'image (le haut du formulaire est caché) ; sinon un peu sous le centre
    const want = kb ? pane.scrollTop + (r.top - pr.top) - 22 : pane.scrollTop + (r.top - pr.top) + r.height / 2 - pr.height * 0.58;
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
    el('cinElect').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').substring(0, 12); });
    el('marquageInput').addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });
    el('numSerieCinPart1').addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });   // 1re partie : chiffres seulement (clavier numérique)
    document.querySelectorAll('#f input[type=text],#f input[type=email]').forEach(i => i.setAttribute('enterkeyhint', 'next'));
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
    wireFlow();
    el('f').addEventListener('input', e => { if (e.isTrusted) dirty = true; });
    el('f').addEventListener('change', e => { if (e.isTrusted) dirty = true; });
    el('anomalieCheckbox').addEventListener('change', function () { $('save').textContent = this.checked ? '💾 Enregistrer en tant qu\'anomalie (hors ligne)' : '💾 Enregistrer (hors ligne)'; });
  }

  // =====================================================================
  // v1.4 — Validation en direct, popups de choix et navigation : le clavier ne se ferme JAMAIS pendant la saisie
  // =====================================================================
  const LABELS = { nomElect: 'nom', dateNaiss: 'date de naissance', neversElect: 'né(e) vers', lieuNaiss: 'lieu de naissance', sexeLahy: 'sexe', nomPereElect: 'nom du père',
    nomMereElect: 'nom de la mère', adresseElect: 'adresse', professionElect: 'profession', cinElect: 'CIN', dateDeliv: 'date de délivrance', lieuDeliv: 'lieu de délivrance',
    dRecensement: 'date du recensement', Observation: 'observation', emailElect: 'email' };
  let cinPre = '';                                   // préfixes CIN (codes district) autorisés, séparés par des virgules ; vide = non contrôlé
  try { ST.get('hoCinPre').then(r => { cinPre = (r && r.hoCinPre) || ''; }); } catch (e) { /* ignore */ }
  const anomaly = () => el('anomalieCheckbox').checked;
  const parseD = s => { const [d, m, y] = s.split('/').map(Number); return new Date(y, m - 1, d); };
  const reqMsg = t => v => String(v).trim() ? '' : t;
  function dateRule(v) { if (!v) return ''; if (!validDate(v)) return 'Date invalide : utilisez JJ/MM/AAAA.'; return ''; }
  const RULES = {
    nomElect: reqMsg('Nom obligatoire.'),
    dateNaiss: v => { const m = dateRule(v); if (m) return m; return v && parseD(v) > new Date() ? 'Date de naissance dans le futur.' : ''; },
    neversElect: v => {
      if (!v) return el('dateNaiss').value ? '' : 'Date de naissance ou né(e) vers obligatoire.';
      if (!/^\d{4}$/.test(v)) return 'Année sur 4 chiffres (ex : 1985).';
      return (+v < 1900 || +v > new Date().getFullYear()) ? 'Année invalide.' : '';
    },
    lieuNaiss: reqMsg('Lieu de naissance obligatoire.'),
    nomPereElect: v => (String(v).trim() || el('piPere').checked) ? '' : 'Nom du père obligatoire (ou PI).',
    nomMereElect: v => (String(v).trim() || el('miMere').checked) ? '' : 'Nom de la mère obligatoire (ou MI).',
    adresseElect: reqMsg('Adresse obligatoire.'),
    professionElect: v => (String(v).trim() || el('professionSans').checked) ? '' : 'Profession obligatoire (ou Sans profession).',
    cinElect: v => {
      if (!v) return 'CIN obligatoire (12 chiffres).';
      if (v.length !== 12) return 'CIN : ' + v.length + ' / 12 chiffres.';
      const pre = cinPre.split(/[,;\s]+/).filter(Boolean);
      if (pre.length && !pre.some(p => v.startsWith(p))) return 'Le CIN doit commencer par le code district (' + pre.join(', ') + ').';
      return '';
    },
    dateDeliv: v => {
      if (!v) return 'Date de délivrance obligatoire.';
      const m = dateRule(v); if (m) return m;
      const D = parseD(v); if (D > new Date()) return 'Date de délivrance dans le futur.';
      const dn = el('dateNaiss').value, nv = el('neversElect').value;
      if (dn && validDate(dn)) {
        const B = parseD(dn);
        if (D < B) return 'Délivrance avant la naissance.';
        const a = D.getFullYear() - B.getFullYear();          // v1.6 : écart en ANNÉES CIVILES (né 1951, CIN 1969 = 18)
        if (a < 18) return 'CIN impossible avant 18 ans : ' + a + ' an(s) à la délivrance.';
      } else if (/^\d{4}$/.test(nv) && D.getFullYear() - Number(nv) < 18) return 'CIN impossible avant 18 ans (né vers ' + nv + ').';
      return '';
    },
    lieuDeliv: reqMsg('Lieu de délivrance obligatoire.'),
    dRecensement: v => { if (!v) return 'Date du recensement obligatoire.'; const m = dateRule(v); if (m) return m; return parseD(v) > new Date() ? 'Date du recensement dans le futur.' : ''; },
    Observation: reqMsg('Observation obligatoire.'),
    emailElect: v => (!v || /^\S+@\S+\.\S+$/.test(v)) ? '' : 'Email invalide.',
    sexeLahy: () => (el('sexeLahy').checked || el('sexeVavy').checked) ? '' : 'Sexe obligatoire.'
  };
  const rowOf = id => { const e0 = el(id); return e0 ? e0.closest('.f') : null; };
  function setErr(id, msg) {
    const row = rowOf(id); if (!row) return;
    let d = row.querySelector(':scope > .ferr');
    if (!msg) { if (d) d.remove(); row.classList.remove('err'); return; }
    if (!d) { d = document.createElement('div'); d.className = 'ferr'; row.appendChild(d); }
    d.textContent = msg; row.classList.add('err');
  }
  function validateField(id) {
    if (!RULES[id]) return '';
    if (anomaly()) { setErr(id, ''); return ''; }
    const msg = RULES[id](el(id).type === 'radio' ? '' : el(id).value);
    setErr(id, msg); return msg;
  }
  function clearErrors() { document.querySelectorAll('#f .f.err').forEach(r => { r.classList.remove('err'); const d = r.querySelector(':scope > .ferr'); if (d) d.remove(); }); }
  function validateAll() {
    const out = [];
    Object.keys(RULES).forEach(id => {
      if (id === 'neversElect' && el('dateNaiss').value) return;
      const m = validateField(id);
      if (m) out.push({ id, msg: m, label: LABELS[id] || id });
    });
    return out;
  }
  const dep = { dateNaiss: ['dateDeliv'], neversElect: ['dateDeliv'], piPere: ['nomPereElect'], miMere: ['nomMereElect'], professionSans: ['professionElect'] };

  // ----- popup de choix (au-dessus du clavier, sans jamais lui prendre le focus) -----
  const proxy = $('kbProxy'), qp = $('qp');
  let qs = null;                                    // popup ouvert : { target, defFn, enterFn, keys }
  const STOPS = ['numeroLigneInput', 'marquageInput', 'nomElect', 'prenomElect', 'dateNaiss', 'neversElect', 'lieuNaiss', '@sexe', '@handicap', 'nomPereElect', 'nomMereElect',
    'adresseElect', 'hamauElect', 'professionElect', 'cinElect', 'dateDeliv', 'lieuDeliv', 'numSerieCinPart1', 'numSerieCinPart2', 'dRecensement', 'telephoneElect', 'emailElect', '@observation'];
  const fire = (id, ev) => el(id).dispatchEvent(new Event(ev || 'change', { bubbles: true }));
  const rowTop = id => {
    const row = rowOf(id) || el(id); if (!row) return;
    const pane = $('left'), pr = pane.getBoundingClientRect(), r = row.getBoundingClientRect();
    pane.scrollTo({ top: Math.max(0, Math.round(pane.scrollTop + (r.top - pr.top) - 22)), behavior: 'smooth' });
  };
  function closeQp() { qs = null; qp.classList.remove('open'); qp.innerHTML = ''; proxy.value = ''; }
  function openQp(o) {
    // o: { title, target, buttons:[{l, k:'lettres', sel, fn}], enter: fn, follow: id }
    qs = o;
    qp.innerHTML = '';
    const t = document.createElement('div'); t.className = 'qt'; t.textContent = o.title; qp.appendChild(t); o.titleEl = t;
    const b = document.createElement('div'); b.className = 'qb'; qp.appendChild(b);
    o.buttons.forEach(x => {
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = x.l; if (x.sel) btn.className = 'sel';
      btn.addEventListener('pointerdown', e => e.preventDefault());          // garde le focus (donc le clavier)
      btn.addEventListener('mousedown', e => e.preventDefault());
      btn.addEventListener('click', () => { dirty = true; x.fn(); });
      b.appendChild(btn);
    });
    qp.classList.add('open');
    proxy.value = '';
    try { proxy.focus({ preventScroll: true }); } catch (e) { proxy.focus(); }
    rowTop(o.rowId || o.target);
    followImg(el(o.follow || o.target));
  }
  proxy.addEventListener('keydown', e => {
    if (!qs) return;
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); return qs.enter ? qs.enter() : null; }
    if (e.key === 'Tab' && e.shiftKey || (e.key === 'Backspace' && !proxy.value)) { e.preventDefault(); const id = qs.stop || qs.target; closeQp(); return goBefore(id); }
    if (e.key === 'Escape') { e.preventDefault(); const id = qs.rowId || qs.target; closeQp(); const x = el(id); if (x) x.focus(); }
  });
  proxy.addEventListener('input', () => {
    const ch = proxy.value.slice(-1).toLowerCase(); proxy.value = '';
    if (!qs || !ch) return;
    const hit = qs.buttons.find(x => (x.k || '').includes(ch));
    if (hit) { dirty = true; hit.fn(); }
  });
  proxy.addEventListener('blur', () => setTimeout(() => { if (qs && document.activeElement !== proxy) closeQp(); }, 250));

  function stopId(s) { return s.charAt(0) === '@' ? s : s; }
  function usable(s) {
    if (s.charAt(0) === '@') return true;
    const e0 = el(s); return !!e0 && !e0.disabled && e0.offsetParent !== null;
  }
  function finishForm() { const a = document.activeElement; if (a && a.blur) a.blur(); closeQp(); $('save').focus({ preventScroll: true }); }
  function focusStop(s) {
    if (s.charAt(0) === '@') return openPicker(s.slice(1));
    const e0 = el(s); e0.focus(); if (e0.select && e0.type !== 'email') { try { e0.setSelectionRange(e0.value.length, e0.value.length); } catch (e) { /* ignore */ } }
  }
  function goAfter(id) {
    closeQp();
    const i = STOPS.indexOf(id);
    for (let k = i + 1; k < STOPS.length; k++) if (usable(STOPS[k])) return focusStop(STOPS[k]);
    finishForm();
  }
  function goBefore(id) {
    const i = STOPS.indexOf(id);
    for (let k = i - 1; k >= 0; k--) if (usable(STOPS[k])) return focusStop(STOPS[k]);
  }
  const PICK = {
    sexe: { title: 'Sexe', target: 'sexeLahy', req: true,
      opts: () => [{ l: 'LAHY', v: 'LAHY', k: 'l1' }, { l: 'VAVY', v: 'VAVY', k: 'v2' }],
      cur: () => el('sexeLahy').checked ? 'LAHY' : el('sexeVavy').checked ? 'VAVY' : '',
      set: v => { const r = el(v === 'LAHY' ? 'sexeLahy' : 'sexeVavy'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); setErr('sexeLahy', ''); } },
    handicap: { title: 'Handicap (Entrée = aucun)', target: 'handicapElect',
      opts: () => [...el('handicapElect').options].map(o => ({ l: o.text, v: o.value })),
      cur: () => el('handicapElect').value,
      set: v => { el('handicapElect').value = v; fire('handicapElect'); } },
    observation: { title: 'Observation', target: 'Observation', req: true, last: true,
      opts: () => [...el('Observation').options].filter(o => o.value).map(o => ({ l: o.text, v: o.value })),
      cur: () => el('Observation').value,
      set: v => { el('Observation').value = v; fire('Observation'); setErr('Observation', ''); } }
  };
  function openPicker(name) {
    const P = PICK[name], id = '@' + name;
    const done = () => { if (P.last) { closeQp(); finishForm(); } else goAfter(id); };
    const cur = P.cur();
    const buttons = P.opts().map(o => ({ l: o.l, k: o.k, sel: o.v === cur && (cur !== '' || name === 'handicap'), fn: () => { P.set(o.v); done(); } }));
    openQp({ title: P.title, target: P.target, stop: id, rowId: P.target, buttons,
      enter: () => {
        if (P.req && !P.cur()) { if (qs && qs.titleEl) { qs.titleEl.textContent = P.title + ' — choisissez une option'; qs.titleEl.style.color = 'var(--bad)'; } return; }
        done();
      } });
  }
  function confirmQp(title, target, yesL, noL, yesFn, noFn, defYes) {
    const buttons = [{ l: yesL, k: 'oey', fn: yesFn }, { l: noL, k: 'nt', fn: noFn }];
    openQp({ title, target, rowId: target, buttons, enter: defYes ? yesFn : noFn });
  }
  function parentLeave(kind) {
    const c = kind === 'pere' ? { inp: 'nomPereElect', feu: 'feuPere', pi: 'piPere', who: 'père', PI: 'PI', Feu: 'Feu' }
      : { inp: 'nomMereElect', feu: 'feueMere', pi: 'miMere', who: 'mère', PI: 'MI', Feu: 'Feue' };
    const v = el(c.inp).value.trim();
    if (el(c.pi).checked) return goAfter(c.inp);
    const back = () => { closeQp(); el(c.inp).focus(); };
    if (!v) return confirmQp('Nom du ' + c.who + ' vide : ' + c.PI + ' ?', c.inp, '✔ ' + c.PI + ' (tsy fantatra)', '✎ Tsia, hosoratako',
      () => { el(c.pi).checked = true; fire(c.pi); setErr(c.inp, ''); goAfter(c.inp); }, back, true);
    if (el(c.feu).checked) return goAfter(c.inp);
    confirmQp(c.who.charAt(0).toUpperCase() + c.who.slice(1) + ' « ' + v + ' » : ' + c.Feu + ' ?', c.inp, '✔ ' + c.Feu + ' (maty)', 'Tsia (velona)',
      () => { el(c.feu).checked = true; fire(c.feu); goAfter(c.inp); }, () => goAfter(c.inp), false);
  }
  function profLeave() {
    if (el('professionElect').value.trim() || el('professionSans').checked) return goAfter('professionElect');
    confirmQp('Profession vide : sans profession ?', 'professionElect', '✔ Sans profession', '✎ Tsia, hosoratako',
      () => { el('professionSans').checked = true; fire('professionSans'); setErr('professionElect', ''); goAfter('professionElect'); },
      () => { closeQp(); el('professionElect').focus(); }, true);
  }
  function leave(id) {
    if (id === 'nomPereElect') return parentLeave('pere');
    if (id === 'nomMereElect') return parentLeave('mere');
    if (id === 'professionElect') return profLeave();
    validateField(id);
    goAfter(id);
  }
  function wireFlow() {
    const form = el('f');
    form.addEventListener('keydown', ev => {
      const id = ev.target && ev.target.id;
      if (!id || STOPS.indexOf(id) < 0) return;
      if (ev.key === 'Enter' || (ev.key === 'Tab' && !ev.shiftKey)) {
        ev.preventDefault(); ev.stopPropagation();
        if (ev.ctrlKey) return saveRec();
        leave(id);
      } else if (ev.key === 'Tab' && ev.shiftKey) { ev.preventDefault(); goBefore(id); }
    }, true);
    // erreur immédiate quand on quitte un champ (rempli ou sauté) ; elle disparaît dès que la valeur devient correcte
    form.addEventListener('focusout', ev => {
      const id = ev.target && ev.target.id;
      if (!id || !RULES[id] || qs) return;
      if (id === 'neversElect' || id === 'nomPereElect' || id === 'nomMereElect' || id === 'professionElect') { if (!ev.relatedTarget) return; }
      if (id === 'dateNaiss' && !el('dateNaiss').value) return;
      validateField(id);
    });
    form.addEventListener('input', ev => {
      const id = ev.target && ev.target.id;
      if (!id) return;
      const row = rowOf(id);
      if (row && row.classList.contains('err') && RULES[id]) validateField(id);
      (dep[id] || []).forEach(d => { if (el(d).value || (rowOf(d) && rowOf(d).classList.contains('err'))) validateField(d); });
    });
    form.addEventListener('change', ev => {
      const id = ev.target && ev.target.id;
      (dep[id] || []).forEach(d => { if (el(d).value || (rowOf(d) && rowOf(d).classList.contains('err'))) validateField(d); });
      if (id === 'anomalieCheckbox') { if (ev.target.checked) clearErrors(); }
    });
    document.addEventListener('tadidy-pick', ev => { const id = ev.target && ev.target.id; if (id && STOPS.indexOf(id) >= 0 && form.contains(ev.target)) setTimeout(() => leave(id), 30); });
  }

  function captureState() {
    const vals = {}, checks = {}, disabled = {};
    IDS.forEach(id => { vals[id] = el(id).value; if (el(id).disabled) disabled[id] = true; });
    CHECKS.forEach(id => { checks[id] = el(id).checked; });
    return { vals, checks, disabled, sexe: el('sexeLahy').checked ? 'LAHY' : el('sexeVavy').checked ? 'VAVY' : '' };
  }
  function setDoneBar(t, cls) { const b = $('doneBar'); b.textContent = t || ''; b.className = cls || ''; b.style.display = t ? 'block' : 'none'; }
  function restoreState(d) {
    const vals = (d && d.vals) || {}, checks = (d && d.checks) || {}, dis = (d && d.disabled) || {};
    IDS.forEach(id => { el(id).value = vals[id] == null ? '' : vals[id]; el(id).disabled = !!dis[id]; });
    CHECKS.forEach(id => { el(id).checked = !!checks[id]; });
    el('sexeLahy').checked = !!d && d.sexe === 'LAHY'; el('sexeVavy').checked = !!d && d.sexe === 'VAVY';
    el('anomalieCheckbox').dispatchEvent(new Event('change'));
    clearErrors(); closeQp(); setDoneBar('');
  }
  function clearForm(keepNumber) {
    restoreState(null);
    if (!keepNumber) { $('numeroLigneInput').value = ''; lastNum = ''; }
    dirty = false;
  }
  let lastNum = '';
  function loadFormFor(n) {
    const r = recs.get(stripZ(n));
    if (r && r.rec.bad) { restoreState(null); dirty = false; setDoneBar('🚫 EFA VITA : feuillet ' + n + ' inexploitable (' + r.rec.bad.motif + (r.rec.bad.remarque ? ' · ' + r.rec.bad.remarque : '') + ')' + (r.rec.sent ? ' · efa alefa tany amin\'ny serveur' : ' · mbola tsy alefa'), 'bad'); return; }
    if (r) {
      restoreState(r.rec.data); setDoneBar('✔ EFA VITA ny feuillet ' + n + ' · saisie hors ligne' + (r.rec.sent ? ' · efa alefa tany amin\'ny serveur (' + fmt(r.rec.sentAt) + ')' : ' · mbola tsy alefa'), (r.rec.srv && r.rec.srv.exists && !r.rec.sent) ? 'wr' : '');
    }
    else { restoreState(null); saveMsg(''); }
    dirty = false;
  }
  async function confirmLeave() {
    if (!dirty) return true;
    // v1.6 : pas de question si le formulaire est vide, ou identique à ce qui est déjà enregistré
    const st = captureState();
    const has = IDS.some(id => id !== 'numeroLigneInput' && String(st.vals[id] || '').trim()) || st.sexe || CHECKS.some(id => st.checks[id]);
    if (!has) { dirty = false; return true; }
    const r = recs.get(stripZ($('numeroLigneInput').value.replace(/\D/g, '')));
    if (r && !r.rec.bad && JSON.stringify(r.rec.data) === JSON.stringify(st)) { dirty = false; return true; }
    return confirm('Une saisie est en cours, non enregistrée. L\'abandonner ?');
  }
  let smT = null;
  function saveMsg(t, cls) { const m = $('saveMsg'); m.textContent = t || ''; m.className = cls || ''; clearTimeout(smT); if (t && cls !== 'bad') smT = setTimeout(() => { m.textContent = ''; }, 4500); }

  // ---------- enregistrer / supprimer ----------
  function validateRec() {
    const miss = [];
    if (!stripZ($('numeroLigneInput').value.replace(/\D/g, ''))) miss.push('numéro feuillet');
    if (!anomaly()) {
      const errs = validateAll();
      errs.forEach(x => miss.push(x.label));
      if (errs.length) { const first = errs[0].id; const t0 = el(first); rowTop(first); if (t0 && t0.type !== 'radio' && !t0.disabled) { try { t0.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }
    }
    return miss;
  }
  async function saveRec() {
    const n = $('numeroLigneInput').value.replace(/\D/g, '');
    if (!carnetNum) return saveMsg('Choisissez d\'abord un carnet.', 'bad');
    const miss = validateRec();
    if (miss.length) return saveMsg('À compléter / corriger : ' + miss.join(', ') + '.', 'bad');
    const key = recKey(stage, carnetNum, n);
    const old = recs.get(stripZ(n));
    if (old && old.rec.sent && !confirm('Ce feuillet a déjà été ENVOYÉ au serveur le ' + fmt(old.rec.sentAt) + '. Remplacer la saisie hors ligne (elle sera de nouveau « en attente ») ?')) return;
    if (old && !old.rec.sent && !dirty && JSON.stringify(old.rec.data) === JSON.stringify(captureState())) { /* inchangé */ }
    const rec = { v: 1, stage, user, carnetNum, carnetRel, feuillet: n, data: captureState(), savedAt: Date.now(), sent: false };
    await ST.set({ [key]: rec });
    recs.set(stripZ(n), { key, rec });
    dirty = false; scheduleSnap();
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
    $('carnetLbl').textContent = carnetNum ? carnetNum + (pages.length ? ' · ' + done + '/' + pages.length : done ? ' · ' + done : '') : 'Carnets';
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
    const fname = 'ceni-hors-ligne.json';          // v1.6 : toujours le même nom (le fichier contient TOUT, anciens imports compris)
    let shared = false;
    if (share) { try { const file = new File([blob], fname, { type: 'application/json' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: fname }); shared = true; } } catch (e) { if (e && e.name === 'AbortError') return; } }
    if (!shared) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }
    await ST.set({ hoExportAt: Date.now() }); loadCarnetList();
    toast('⬇ ' + out.records.length + ' feuille(s) dans ceni-hors-ligne.json (contient tout : supprimez les anciens fichiers d\'export).');
  }
  // v1.6 : import de UN ou PLUSIEURS fichiers (2 téléphones) : tout est fusionné, le plus récent gagne
  async function importFiles(files) {
    const all = await ST.get(null), upd = {};
    let added = 0, updated = 0, kept = 0, okF = 0, badF = [];
    const cur = k => (k in upd ? upd[k] : all[k]);
    for (const file of files) {
      let j;
      try { j = JSON.parse(await file.text()); } catch (e) { badF.push(file.name); continue; }
      if (!j || j.format !== 'ceni-hors-ligne' || !Array.isArray(j.records)) { badF.push(file.name); continue; }
      okF++;
      j.records.forEach(r => {
        if (!r || String(r.stage) !== '1' || !r.carnetNum || !r.feuillet) return;
        const key = recKey(r.stage, r.carnetNum, r.feuillet), c = cur(key);
        if (!c) { upd[key] = r; added++; return; }
        if ((r.savedAt || 0) > (c.savedAt || 0)) { const m = Object.assign({}, r); if (c.sent && (c.savedAt || 0) === (r.savedAt || 0)) m.sent = true; upd[key] = m; updated++; return; }
        if ((r.savedAt || 0) === (c.savedAt || 0) && r.sent && !c.sent) { upd[key] = Object.assign({}, c, { sent: true, sentAt: r.sentAt }); updated++; return; }
        kept++;
      });
      Object.keys(j.carnets || {}).forEach(u => { const k = 'carnets|' + u, c = cur(k); if (!c || (j.carnets[u].at || 0) > (c.at || 0)) upd[k] = j.carnets[u]; });
      Object.keys(j.stages || {}).forEach(u => { if (!cur('stage|' + u)) upd['stage|' + u] = j.stages[u]; });
      if (j.lastUser && !all.hoLastUser && !upd.hoLastUser) upd.hoLastUser = j.lastUser;
    }
    if (!okF) return alert('Aucun fichier valide : ce n\'est pas une sauvegarde « CENI Hors-ligne ».' + (badF.length ? '\n' + badF.join('\n') : ''));
    await ST.set(upd);
    alert('Fusion terminée (' + okF + ' fichier(s)) : ' + added + ' ajoutée(s), ' + updated + ' mise(s) à jour, ' + kept + ' déjà à jour.' + (badF.length ? '\nIllisible(s) : ' + badF.join(', ') : '') + '\nLe prochain export contiendra tout.');
    await loadUsers(); await loadCarnetList(); await loadRecs(); renderRecs(); scheduleSnap();
  }
  $('impFile').onchange = () => { const fs = [...$('impFile').files]; $('impFile').value = ''; if (fs.length) importFiles(fs); };

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
    $('menuInfo').textContent = $('info').textContent + '\n' + 'Dernière synchro interne : ' + (all.hoSyncAt ? fmt(all.hoSyncAt) : 'jamais') + ' · dernier export : ' + (all.hoExportAt ? fmt(all.hoExportAt) : 'jamais') + est;
    $('menuOv').classList.add('open');
  };
  $('menuBtn').onclick = openMenu; $('menuX').onclick = () => $('menuOv').classList.remove('open');
  const closeMenu = () => $('menuOv').classList.remove('open');
  $('viewerBtn').onclick = () => { $('viewer').classList.toggle('hid'); $('split').style.display = $('viewer').classList.contains('hid') ? 'none' : ''; };
  $('miFolder').onclick = () => { closeMenu(); openImport(true); };
  $('miFiles').onclick = () => { closeMenu(); openImport(false); };
  // v1.6 : synchro interne AUTOMATIQUE (après chaque enregistrement) + copie de secours hors IndexedDB ;
  // au démarrage (ex. après une mise à jour de l'application) tout ce qui manque est récupéré tout seul.
  let snapT = null;
  function scheduleSnap() { clearTimeout(snapT); snapT = setTimeout(() => { internalSync(true).catch(() => {}); }, 1500); }
  async function autoRestore() {
    try {
      const all = await ST.get(null), have = new Set(Object.keys(all).filter(k => k.startsWith('rec|')));
      let srcs = [];
      if (all.snapshot && all.snapshot.records) srcs.push(all.snapshot.records);
      try { const c = await caches.open('ceni-hl-data'); const r = await c.match('backup.json'); if (r) { const j = await r.json(); if (j && j.records) srcs.push(j.records); } } catch (e) { /* ignore */ }
      const upd = {}; let n = 0;
      srcs.forEach(recsArr => recsArr.forEach(r => { if (!r || !r.carnetNum || !r.feuillet) return; const k = recKey(r.stage, r.carnetNum, r.feuillet), c = upd[k] || all[k]; if (!c || (r.savedAt || 0) > (c.savedAt || 0)) { upd[k] = r; n++; } }));
      if (n) { await ST.set(upd); toast('♻ ' + n + ' feuille(s) récupérée(s) automatiquement.'); }
    } catch (e) { /* ignore */ }
  }
  async function internalSync(silent) {
    const all = await ST.get(null), records = Object.keys(all).filter(k => k.startsWith('rec|')).map(k => all[k]);
    await ST.set({ snapshot: { at: Date.now(), records }, hoSyncAt: Date.now() });
    try { const c = await caches.open('ceni-hl-data'); await c.put('backup.json', new Response(JSON.stringify({ at: Date.now(), records }), { headers: { 'Content-Type': 'application/json' } })); } catch (e) { /* ignore */ }
    if (silent) return;
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
  $('miCinPre').onclick = async () => {
    const cur = ((await ST.get('hoCinPre')).hoCinPre) || '';
    const v = prompt('Codes par lesquels le CIN doit commencer (code district), séparés par des virgules.\nExemple : 112,113\nLaisser vide = ne pas contrôler.', cur);
    if (v === null) return;
    await ST.set({ hoCinPre: v.replace(/[^\d,; ]/g, '').trim() });
    location.reload();
  };
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
  let maxH = 0;
  const setH = () => {
    const vh = window.visualViewport ? visualViewport.height : innerHeight;
    maxH = Math.max(maxH, vh);
    document.documentElement.style.setProperty('--app-h', vh + 'px');
    const was = document.body.classList.contains('kb'), now = vh < maxH * 0.78;
    document.body.classList.toggle('kb', now);      // clavier ouvert : on ne garde que l'essentiel
    if (now !== was) setTimeout(() => { const a = document.activeElement; if (a && a.matches && a.matches('#f input,#f select')) a.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); }, 200);
  };
  window.addEventListener('resize', setH); window.addEventListener('orientationchange', () => { maxH = 0; setTimeout(setH, 300); });
  if (window.visualViewport) visualViewport.addEventListener('resize', setH); setH();
  window.addEventListener('scroll', () => { if (window.scrollY || window.scrollX) window.scrollTo(0, 0); }, true);
  // ---------- démarrage ----------
  (async () => {
    wireForm();
    const all = await loadUsers();
    const last = all.hoLast || {};
    stage = '1'; user = '';
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
    await autoRestore();
    await loadCarnetList();
    if (last.carnetNum) await loadCarnet(last.carnetNum, '');
    else showMsg('Bienvenue. ☰ Menu → « Importer des images » (le dossier de vos carnets), puis ouvrez un carnet avec 📚.');
  })();
  window.addEventListener('beforeunload', e => { if (dirty && IDS.some(id => id !== 'numeroLigneInput' && String(el(id).value || '').trim())) { e.preventDefault(); e.returnValue = ''; } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* ignore */ });
})();
