// Stockage local (IndexedDB) : même interface que chrome.storage.local + magasin d'images.
(function () {
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('ceni-mobile', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('imgs'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const o = t.objectStore(store); let out; try { out = fn(o); } catch (e) { return rej(e); } t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  const KV = {
    async get(k) {
      const d = await db();
      return new Promise((res, rej) => {
        const o = d.transaction('kv').objectStore('kv'), out = {};
        if (k == null) { const c = o.openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); }; c.onerror = () => rej(c.error); return; }
        const keys = Array.isArray(k) ? k : [k]; let n = keys.length;
        keys.forEach(key => { const q = o.get(key); q.onsuccess = () => { if (q.result !== undefined) out[key] = q.result; if (--n === 0) res(out); }; q.onerror = () => rej(q.error); });
      });
    },
    set(obj) { return tx('kv', 'readwrite', o => { Object.keys(obj).forEach(k => o.put(obj[k], k)); }); },
    remove(keys) { keys = Array.isArray(keys) ? keys : [keys]; return tx('kv', 'readwrite', o => { keys.forEach(k => o.delete(k)); }); },
    clearKV() { return tx('kv', 'readwrite', o => { o.clear(); }); },
    // images : clé « carnet|nom »
    putImg(key, val) { return tx('imgs', 'readwrite', o => { o.put(val, key); }); },
    getImg(key) { return tx('imgs', 'readonly', o => o.get(key)); },
    async imgKeys(prefix) {
      const d = await db();
      return new Promise((res, rej) => { const o = d.transaction('imgs').objectStore('imgs'); const q = prefix ? o.getAllKeys(IDBKeyRange.bound(prefix, prefix + '￿')) : o.getAllKeys(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    },
    delImgs(keys) { return tx('imgs', 'readwrite', o => { keys.forEach(k => o.delete(k)); }); },
    clearImgs() { return tx('imgs', 'readwrite', o => { o.clear(); }); }
  };
  self.KV = KV;
  // chrome.storage.local factice pour le script Tadidy (suggestions) intégré
  self.chrome = { storage: { local: { get(k, cb) { KV.get(k).then(r => cb && cb(r)); }, set(o) { return KV.set(o); } }, onChanged: { addListener() {} } } };
})();
