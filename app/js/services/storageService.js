/* ============================================================
   storageService.js — persistência local (credenciais + cache)
   Compatível com LG webOS (sem Promise, ES5)
   ============================================================ */
var StorageService = (function () {
  var PREFIX = 'meuiptv.tv.';
  var memory = {};

  function hasLS() {
    try {
      window.localStorage.setItem('__t', '1');
      window.localStorage.removeItem('__t');
      return true;
    } catch (e) { return false; }
  }

  var lsOk = hasLS();

  function set(key, value) {
    var k = PREFIX + key;
    var str;
    try { str = JSON.stringify(value); } catch (e) { str = String(value); }
    if (lsOk) {
      try { window.localStorage.setItem(k, str); } catch (e) { memory[k] = str; }
    } else {
      memory[k] = str;
    }
  }

  function get(key) {
    var k = PREFIX + key;
    var str = null;
    if (lsOk) {
      try { str = window.localStorage.getItem(k); } catch (e) { str = null; }
    }
    if (str === null && memory[k] !== undefined) { str = memory[k]; }
    if (str === null) { return null; }
    try { return JSON.parse(str); } catch (e) { return str; }
  }

  function remove(key) {
    var k = PREFIX + key;
    if (lsOk) { try { window.localStorage.removeItem(k); } catch (e) {} }
    delete memory[k];
  }

  /* ---------- credenciais ---------- */
  function saveCreds(server, user, pass) {
    set('server', server);
    set('user', user);
    set('pass', pass);
  }
  function loadCreds() {
    return { server: get('server'), user: get('user'), pass: get('pass') };
  }
  function clearCreds() { remove('server'); remove('user'); remove('pass'); }

  /* ---------- cache leve (imagens e listas) ---------- */
  function cacheSet(name, data, ttlMs) {
    var ttl = (typeof ttlMs === 'number') ? ttlMs : (5 * 60 * 1000);
    set('cache.' + name, { at: Date.now(), ttl: ttl, data: data });
  }
  function cacheGet(name) {
    var o = get('cache.' + name);
    if (!o || !o.data) return null;
    if (Date.now() - o.at > o.ttl) return null;
    return o.data;
  }
  function cacheClear() {
    if (!lsOk) { memory = {}; return; }
    var rem = [];
    try {
      for (var i = 0; i < window.localStorage.length; i++) {
        var key = window.localStorage.key(i);
        if (key && key.indexOf(PREFIX) === 0) rem.push(key);
      }
    } catch (e) {}
    for (var j = 0; j < rem.length; j++) { try { window.localStorage.removeItem(rem[j]); } catch (e) {} }
  }

  /* ---------- favoritos ---------- */
  /* registro: { t:'live'|'vod'|'series', id:String, name:String, img:String, sub:String, ext:String } */
  function favAll() {
    var a = get('favs');
    return (a && a.length) ? a : [];
  }
  function favFind(t, id) {
    var a = favAll();
    for (var i = 0; i < a.length; i++) {
      if (a[i].t === t && String(a[i].id) === String(id)) return a[i];
    }
    return null;
  }
  function isFav(t, id) { return favFind(t, id) !== null; }
  function favAdd(rec) {
    if (!rec || !rec.t || rec.id === undefined || rec.id === null) return false;
    var a = favAll();
    for (var i = 0; i < a.length; i++) {
      if (a[i].t === rec.t && String(a[i].id) === String(rec.id)) return false; /* já existe */
    }
    a.push(rec);
    set('favs', a);
    return true;
  }
  function favRemove(t, id) {
    var a = favAll();
    var out = [];
    var changed = false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].t === t && String(a[i].id) === String(id)) { changed = true; continue; }
      out.push(a[i]);
    }
    if (changed) set('favs', out);
    return changed;
  }
  function favClear() { set('favs', []); }

  return {
    saveCreds: saveCreds,
    loadCreds: loadCreds,
    clearCreds: clearCreds,
    set: set,
    get: get,
    remove: remove,
    cacheSet: cacheSet,
    cacheGet: cacheGet,
    cacheClear: cacheClear,
    favAll: favAll,
    favFind: favFind,
    isFav: isFav,
    favAdd: favAdd,
    favRemove: favRemove,
    favClear: favClear
  };
})();
