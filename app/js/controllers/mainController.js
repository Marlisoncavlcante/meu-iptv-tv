/* ============================================================
   mainController.js — telas, foco, renderização e ações
   (Canais / Filmes / Séries com subgrupos e miniaturas)
   ============================================================ */

/* ==================================================================
   Gerenciamento de imagem (webOS) — estratégia 100% XHR + BASE64.
   Diagnóstico: nesta TV as imagens remotas BAIXAM e DECODIFICAM mas
   NÃO são pintadas (nem como <img>, nem como background remoto).
   Solução: TODA imagem é buscada via XMLHttpRequest (mesmo caminho
   do login, comprovado) e aplicada como data URI (dado LOCAL) no
   background — a TV pinta conteúdo local normalmente.
   ================================================================== */
window.MeuIPTVImg = {
  cache: {},        /* url original -> dataURI (evita re-baixar)   */
  queue: [],        /* jobs pendentes (fila p/ limite de conexões)  */
  inflight: {},     /* url -> job em andamento (dedupe)             */
  active: 0,
  maxActive: 4,
  statLoad: 0,
  statFail: 0,

  /* inicia o carregamento de uma div de poster (.tile-poster/.sh-poster) */
  startBg: function (div) {
    if (!div || div.getAttribute('data-bgstart') === '1') return;
    div.setAttribute('data-bgstart', '1');
    var u = div.getAttribute('data-url') || '';
    if (!u) { div.setAttribute('data-state', 'none'); return; }
    if (MeuIPTVImg.cache[u]) { MeuIPTVImg.applyBg(div, u, MeuIPTVImg.cache[u]); return; }
    var variants = XtreamService.imageVariants(u);
    if (!variants.length) { div.setAttribute('data-state', 'none'); return; }
    if (window.IS_ANDROID) { MeuIPTVImg.androidLoad(div, u); return; }
    MeuIPTVImg.rescue(div, u);
  },

  /* Android (WebView/Chromium): pinta imagem remota direto — pré-carrega com
     <img> (sem CORS, sem base64) e aplica no background quando carregar. */
  androidLoad: function (div, key) {
    if (div.getAttribute('data-abg') === '1') return;
    div.setAttribute('data-abg', '1');
    var urls = XtreamService.imageVariants(key);
    if (!urls.length) return;
    var pos = 0;
    var next = function () {
      if (pos >= urls.length) return;
      var i = pos;
      var im = new Image();
      im.onload = function () {
        div.style.backgroundImage = 'url("' + MeuIPTVImg.cssEsc(urls[i]) + '")';
        div.style.backgroundRepeat = 'no-repeat';
        div.style.backgroundPosition = 'center';
        div.setAttribute('data-state', 'ok');
        var ph = div.firstElementChild;
        if (ph && ph.className && ph.className.indexOf('tile-ph') !== -1) ph.style.display = 'none';
      };
      im.onerror = function () { pos++; next(); };
      im.src = urls[i];
    };
    next();
  },

  /* sem preload remoto (não é pintado): vai direto para XHR->base64 */

  applyBg: function (div, key, urlOrData) {
    /* background-size vem do CSS (.tile.portrait = cover, .tile.landscape = contain,
       .sh-poster = cover) — não setar inline para não anular a regra da miniatura */
    div.style.backgroundImage = 'url("' + MeuIPTVImg.cssEsc(urlOrData) + '")';
    div.style.backgroundRepeat = 'no-repeat';
    div.style.backgroundPosition = 'center';
    div.setAttribute('data-state', 'ok');
    var ph = div.firstElementChild;
    if (ph && ph.className && ph.className.indexOf('tile-ph') !== -1) ph.style.display = 'none';
  },
  cssEsc: function (u) {
    return String(u).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
  },

  /* resgate: XHR -> base64 e aplica como background */
  rescue: function (div, key) {
    if (div.getAttribute('data-rescued') === '1') return;
    div.setAttribute('data-rescued', '1');
    if (!key) { MeuIPTVImg.fail(div); return; }
    if (MeuIPTVImg.cache[key]) { MeuIPTVImg.applyBg(div, key, MeuIPTVImg.cache[key]); return; }
    var job = MeuIPTVImg.inflight[key];
    if (job) { job.divs.push(div); return; }
    var urls = XtreamService.imageVariants(key);
    if (!urls.length) { MeuIPTVImg.fail(div); return; }
    job = { key: key, urls: urls, divs: [div], pos: 0 };
    MeuIPTVImg.inflight[key] = job;
    MeuIPTVImg.queue.push(job);
    MeuIPTVImg.pump();
  },

  pump: function () {
    while (MeuIPTVImg.active < MeuIPTVImg.maxActive && MeuIPTVImg.queue.length) {
      var job = MeuIPTVImg.queue.shift();
      if (job && job.divs.length) {
        MeuIPTVImg.active++;
        MeuIPTVImg.tryNext(job);
      }
    }
  },

  tryNext: function (job) {
    if (job.pos >= job.urls.length) { MeuIPTVImg.done(job, null); return; }
    var url = job.urls[job.pos++];
    var xhr = new XMLHttpRequest();
    try { xhr.open('GET', url, true); } catch (e) { MeuIPTVImg.tryNext(job); return; }
    xhr.responseType = 'arraybuffer';
    xhr.timeout = 20000;
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        var bytes = new Uint8Array(xhr.response);
        if (bytes.length > 0 && bytes.length <= 500000) {
          MeuIPTVImg.done(job, 'data:' + MeuIPTVImg.sniff(bytes) + ';base64,' + MeuIPTVImg.binToB64(bytes));
          return;
        }
      }
      MeuIPTVImg.tryNext(job);
    };
    xhr.onerror = function () { MeuIPTVImg.tryNext(job); };
    xhr.ontimeout = function () { MeuIPTVImg.tryNext(job); };
    try { xhr.send(null); } catch (e2) { MeuIPTVImg.tryNext(job); }
  },

  done: function (job, dataUri) {
    delete MeuIPTVImg.inflight[job.key];
    MeuIPTVImg.active--;
    if (dataUri) {
      MeuIPTVImg.cache[job.key] = dataUri;
      for (var i = 0; i < job.divs.length; i++) {
        MeuIPTVImg.statLoad++;
        MeuIPTVImg.applyBg(job.divs[i], job.key, dataUri);
      }
    } else {
      for (var j = 0; j < job.divs.length; j++) {
        MeuIPTVImg.statFail++;
        MeuIPTVImg.fail(job.divs[j]);
        MeuIPTVImg.retryLater(job.divs[j]);
      }
    }
    MeuIPTVImg.pump();
  },

  fail: function (div) { div.setAttribute('data-state', 'fail'); },

  /* tenta uma última vez após 6s (rede pode ter falhado) */
  retryLater: function (div) {
    if (div.getAttribute('data-retried') === '1') return;
    div.setAttribute('data-retried', '1');
    setTimeout(function () {
      div.setAttribute('data-bgstart', '0');
      div.setAttribute('data-rescued', '0');
      div.removeAttribute('data-state');
      MeuIPTVImg.startBg(div);
    }, 6000);
  },

  binToB64: function (bytes) {
    var bin = '', CH = 0x8000, i;
    for (i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  },
  sniff: function (b) {
    if (b.length > 3 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
    if (b.length > 2 && b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
    if (b.length > 5 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
    if (b.length > 11 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';
    return 'image/jpeg';
  }
};

/* Helpers de marcação (posters usam background-image via window.MeuIPTVImg) */
var MainController = (function () {
  var SECTION_LABELS = {
    live: { title: 'TV ao Vivo', ic: '📡' },
    vod: { title: 'Filmes', ic: '🎬' },
    series: { title: 'Séries', ic: '📺' }
  };

  var state = {
    section: 'live',          /* live | vod | series */
    cats: [],                 /* categorias/subgrupos do tipo atual */
    catId: 'all',
    items: [],                /* itens do subgrupo atual */
    rendered: 0,              /* qtd já renderizada na grade */
    batch: 90,
    seriesCache: {},          /* info de séries já abertas */
    lastCatFocused: null,     /* id da última categoria ativa */
    lastTileFocused: 0,
    kbdOpen: false,           /* teclado virtual de busca visível */
    genreOpen: false,         /* lista de gêneros aberta */
    filterActive: false,      /* grade exibindo resultado de busca */
    filterQuery: '',          /* termo ativo da busca */
    filterRes: [],            /* índices dos itens no resultado */
    filterDraft: '',          /* termo digitado no teclado */
    genreFilter: '',          /* gênero/categoria ativo ('' = todos) */
    sortMode: 'default'       /* default | name | year | rating */
  };

  var els = {};
  var focusedEl = null;
  var isSeriesDetail = false;
  var activeSeason = 1;
  var seriesEpisodes = [];
  var lastTile = -1;          /* índice do último tile aberto na grade */
  var lastEp = null;          /* {season, ep} último episódio aberto */
  var lastFavIndex = 0;       /* índice do último favorito aberto */
  var favOpen = false;        /* origem Favoritos ativa (voltar para ela) */
  var nowPlayingRec = null;   /* registro favoritável da reprodução atual */
  var curSeriesRec = null;    /* registro favoritável da série aberta */

  /* ================= helpers DOM ================= */
  function $(id) { return document.getElementById(id); }
  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function letter(s) {
    s = String(s || '?');
    return esc(s.trim().charAt(0).toUpperCase() || '?');
  }

  /* Monta o bloco de poster (div). A imagem será aplicada como
     background por window.MeuIPTVImg.startBg() — confiável em webOS.
     phContent = conteúdo do placeholder (letra / EP n). */
  function bgTileHtml(url, phContent) {
    return '<span class="tile-poster" data-url="' + esc(url || '') + '">' +
           '<span class="tile-ph">' + phContent + '</span></span>';
  }
  /* Dispara o carregamento das imagens de todos os posters dentro de root */
  function bindBgs(root) {
    var nodes = (root || document).querySelectorAll('.tile-poster[data-url], .sh-poster[data-url]');
    for (var i = 0; i < nodes.length; i++) window.MeuIPTVImg.startBg(nodes[i]);
  }

  /* Varredura: garante que todo poster iniciou o carregamento; os que
     ficaram pendentes (sem load nem error) entram no resgate XHR. */
  var sweepTimer = null;
  function armSweep() {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(function () {
      var nodes = document.querySelectorAll('.tile-poster[data-url], .sh-poster[data-url]');
      for (var i = 0; i < nodes.length; i++) {
        var d = nodes[i];
        if (d.getAttribute('data-bgstart') !== '1') window.MeuIPTVImg.startBg(d);
        else if (d.getAttribute('data-state') !== 'ok' && d.getAttribute('data-rescued') !== '1') {
          window.MeuIPTVImg.rescue(d, d.getAttribute('data-url'));
        }
      }
    }, 4000);
  }

  function init() {
    els.screenLogin = $('screenLogin');
    els.screenMenu = $('screenMenu');
    els.screenList = $('screenList');
    els.screenSeries = $('screenSeries');
    els.screenPlayer = $('screenPlayer');
    els.catList = $('catList');
    els.itemGrid = $('itemGrid');
    els.gridEmpty = $('gridEmpty');
    els.gridLoading = $('gridLoading');
    els.listTitle = $('listTitle');
    els.listSub = $('listSub');
    els.menuUser = $('menuUser');
    els.loginStatus = $('loginStatus');
    els.serBody = $('serBody');
    els.serTitle = $('serTitle');
    els.serSub = $('serSub');
    els.catPanel = $('catPanel');
    els.gridWrap = $('gridWrap');
    els.searchBtn = $('searchBtn');
    els.searchTag = $('searchTag');
    els.sortBtn = $('sortBtn');
    els.genreBtn = $('genreBtn');
    els.genreOv = $('genreOv');
    els.genreOvRows = $('genreOvRows');
    els.genreOvGroup = $('genreOvGroup');
    els.genreOvCount = $('genreOvCount');
    els.kbd = $('kbd');
    els.kbdRows = $('kbdRows');
    els.kbdGroup = $('kbdGroup');
    els.kbdQuery = $('kbdQuery');
    els.kbdCount = $('kbdCount');
    els.screenFav = $('screenFav');
    els.favGrid = $('favGrid');
    els.favEmpty = $('favEmpty');
    els.favSub = $('favSub');
    els.serFavBtn = $('serFavBtn');
    buildKbd();
    PlayerService.setEndedHandler(handlePlayerEnded);

    /* login rápido salvo */
    var c = StorageService.loadCreds();
    if (c.server) { $('inServer').value = c.server; }
    if (c.user) { $('inUser').value = c.user; }
    if (c.pass) { $('inPass').value = c.pass; }

    bindClicks();
  }

  /* ================= loader / toast ================= */
  function showLoader(msg) { var m = $('globalLoaderMsg'); if (m) m.textContent = msg || 'Carregando…'; show($('globalLoader')); }
  function hideLoader() { hide($('globalLoader')); }
  function toast(msg, type, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (type ? ' ' + type : '');
    show(t);
    setTimeout(function () { hide(t); }, ms || 2600);
  }

  /* ================= foco (navegação remota) ================= */
  function focusables() {
    var nodes = [];
    var all;
    if (state.kbdOpen && els.kbd) {
      /* com o teclado de busca aberto, só as teclas são navegáveis */
      all = els.kbd.querySelectorAll('.focusable');
    } else if (state.genreOpen && els.genreOv) {
      all = els.genreOv.querySelectorAll('.focusable');
    } else {
      all = document.querySelectorAll('.screen.active .focusable, .screen.active input');
    }
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      if (n.offsetParent === null && !n.classList.contains('input-fake')) continue;
      if (n.disabled) continue;
      var r = n.getBoundingClientRect();
      /* mantém apenas elementos próximos da área visível (performance) */
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.top > window.innerHeight + 1600 || r.bottom < -1600) continue;
      nodes.push(n);
    }
    return nodes;
  }

  function isVisibleRect(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > -20 && r.top < (window.innerHeight + 20);
  }

  function rectCenter(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function setFocus(el) {
    if (!el) return;
    if (focusedEl === el) { ensureVisible(el); return; }
    if (focusedEl && focusedEl.tagName === 'INPUT') { try { focusedEl.blur(); } catch (e) {} }
    focusedEl = el;
    var list = focusables();
    for (var i = 0; i < list.length; i++) {
      list[i].classList.remove('focused');
    }
    el.classList.add('focused');
    if (el.tagName === 'INPUT' && document.activeElement !== el) { try { el.focus(); } catch (e) {} }
    ensureVisible(el);
    onFocusedChanged(el);
  }

  function ensureVisible(el) {
    var listWrap = nearestScroll(el);
    if (!listWrap) return;
    var r = el.getBoundingClientRect();
    var wr = listWrap.getBoundingClientRect();
    var gap = 12;
    var scrollTop = listWrap.scrollTop;
    if (r.top < wr.top + gap) listWrap.scrollTop = scrollTop - (wr.top + gap - r.top);
    else if (r.bottom > wr.bottom - gap) listWrap.scrollTop = scrollTop + (r.bottom - (wr.bottom - gap));
  }

  function nearestScroll(el) {
    var p = el.parentElement;
    while (p) {
      if (p.scrollHeight > p.clientHeight && /auto|scroll|hidden/.test(getComputedStyle(p).overflowY)) return p;
      p = p.parentElement;
    }
    return null;
  }

  function currentIndex() {
    var list = focusables();
    for (var i = 0; i < list.length; i++) { if (list[i] === focusedEl) return i; }
    return -1;
  }

  function moveFocus(dx, dy) {
    var list = focusables();
    if (!list.length) return;
    var idx = currentIndex();
    var cur = (idx >= 0) ? list[idx] : null;

    /* janela de candidatos para grades muito grandes (performance) */
    if (list.length > 600) {
      var from = Math.max(0, idx - 150);
      list = list.slice(from, from + 450);
      var rel = (idx >= 0) ? idx - from : 0;
      cur = list[rel] || list[0];
    }

    if (!cur) { setFocus(list[0]); return; }

    if (cur.classList.contains('input')) { /* dentro do login: navega entre inputs */ }
    var rc = cur.getBoundingClientRect();
    var cc = rectCenter(rc);

    var best = null, bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === cur) continue;
      var rr = list[i].getBoundingClientRect();
      if (!rr.width) continue;
      var cr = rectCenter(rr);
      var ddx = cr.x - cc.x, ddy = cr.y - cc.y;

      if (dx === 1 && ddx <= 8) continue;
      if (dx === -1 && ddx >= -8) continue;
      if (dy === 1 && ddy <= 8) continue;
      if (dy === -1 && ddy >= -8) continue;

      /* dentro do eixo principal deve ter sobreposição */
      var overlap = true;
      if (dy !== 0) { overlap = Math.min(rc.right, rr.right) - Math.max(rc.left, rr.left) > -30; }
      if (dx !== 0) { overlap = Math.min(rc.bottom, rr.bottom) - Math.max(rc.top, rr.top) > -30; }
      if (!overlap) continue;

      var dist = Math.abs(ddx) + Math.abs(ddy) * 2.2 + Math.abs(ddy === 0 ? 0 : ddx) * 0.6;
      if (dist < bestScore) { bestScore = dist; best = list[i]; }
    }
    if (best) { setFocus(best); }
  }

  function onFocusedChanged(el) {
    /* Subgrupos NÃO abrem ao passar o foco — abrem SOMENTE com OK. */
    if (!el || state.kbdOpen || state.genreOpen) return;
    var idx = el.getAttribute('data-index');
    if (idx !== null && !state.filterActive && !state.genreFilter) {
      var num = parseInt(idx, 10);
      if (!isNaN(num) && num >= state.rendered - 12) appendBatch();
    }
  }

  function pressOk() {
    if (!focusedEl) return;
    /* dentro de um input do login: OK avança campo / confirma no último */
    if (focusedEl.tagName === 'INPUT') {
      advanceLoginField(focusedEl);
      return;
    }
    var action = focusedEl.getAttribute('data-action');
    var section = focusedEl.getAttribute('data-section');
    var type = focusedEl.getAttribute('data-type');
    if (action) { runAction(action, focusedEl); return; }
    if (section) { openSection(section); return; }
    if (type === 'sort') { doSort(); return; }
    if (type === 'genre') { openGenres(); return; }
    if (type === 'genre-item') { applyGenre(focusedEl.getAttribute('data-genre') || ''); return; }
    if (type === 'search') { openSearch(); return; }
    if (type === 'search-exit') { exitActiveView(); return; }
    if (type === 'kbd-key') { searchAddKey(focusedEl.getAttribute('data-key')); return; }
    if (type === 'kbd-space') { searchAddKey(' '); return; }
    if (type === 'kbd-back') { searchBackspace(); return; }
    if (type === 'kbd-clear') { searchClear(); return; }
    if (type === 'kbd-done') { searchApply(); return; }
    if (type === 'cat') {
      selectCategory(focusedEl.getAttribute('data-id'));
      /* o foco entra na grade quando o carregamento terminar */
      return;
    }
    if (type === 'item') { openItem(parseInt(focusedEl.getAttribute('data-index'), 10)); return; }
    if (type === 'fav-item') { openFavItem(parseInt(focusedEl.getAttribute('data-index'), 10)); return; }
    if (type === 'season') { selectSeason(parseInt(focusedEl.getAttribute('data-season'), 10)); return; }
    if (type === 'episode') { openEpisode(parseInt(focusedEl.getAttribute('data-ep'), 10)); return; }
  }

  function pressBack() {
    if (PlayerService.getCurrentUrl()) { PlayerService.close(); resumeAfterPlayer(); return; }
    if (state.kbdOpen) { searchCancel(); return; }
    if (state.genreOpen) { closeGenres(); return; }
    if (state.filterActive && screenIsActive('screenList')) { openSearch(); return; }
    if (state.genreFilter && screenIsActive('screenList')) { openGenres(); return; }
    if (isSeriesDetail) { closeSeriesDetail(); return; }
    if (screenIsActive('screenFav')) { closeFavorites(); return; }
    if (screenIsActive('screenList')) { goHome(); return; }
    if (screenIsActive('screenMenu')) { doLogout(); return; }
  }

  function resumeAfterPlayer() {
    if (isSeriesDetail) {
      if (lastEp && lastEp.season === activeSeason) {
        var epTile = document.querySelector('#epRow .tile[data-ep="' + lastEp.ep + '"]');
        if (epTile) { setFocus(epTile); return; }
      }
      var c = document.querySelector('#screenSeries .season-chip');
      if (c) { setFocus(c); return; }
      var e = document.querySelector('#epRow .tile');
      if (e) { setFocus(e); return; }
    }
    if (screenIsActive('screenFav')) {
      var ft = els.favGrid.querySelector('.tile[data-index="' + lastFavIndex + '"]');
      if (!ft) ft = els.favGrid.querySelector('.tile');
      if (ft) { setFocus(ft); return; }
      var fb = document.querySelector('#screenFav .btn-back');
      if (fb) { setFocus(fb); }
      return;
    }
    if (screenIsActive('screenList')) {
      if (lastTile >= 0) {
        var t = els.itemGrid.querySelector('.tile[data-index="' + lastTile + '"]');
        if (t) { setFocus(t); return; }
      }
      focusFirstTile();
      return;
    }
    if (screenIsActive('screenMenu')) { setFocus(document.querySelector('#screenMenu .menu-card')); }
  }
  function screenIsActive(id) { return $(id) && $(id).classList.contains('active'); }

  function loginFields() { return ['inServer', 'inUser', 'inPass']; }

  function advanceLoginField(current) {
    var ids = loginFields();
    for (var i = 0; i < ids.length; i++) {
      if ($(ids[i]) === current) {
        if (i < ids.length - 1) { setFocus($(ids[i + 1])); return; }
        doLogin();
        return;
      }
    }
  }

  /* ================= eventos de clique ================= */
  function bindClicks() {
    document.addEventListener('click', function (ev) {
      var el = ev.target;
      while (el && el !== document.body) {
        var act = el.getAttribute && el.getAttribute('data-action');
        if (act) { runAction(act, el); return; }
        var section = el.getAttribute && el.getAttribute('data-section');
        if (section) { openSection(section); return; }
        var t = el.getAttribute && el.getAttribute('data-type');
        if (t === 'cat') { selectCategory(el.getAttribute('data-id')); return; }
        if (t === 'sort') { doSort(); return; }
        if (t === 'genre') { openGenres(); return; }
        if (t === 'genre-item') { applyGenre(el.getAttribute('data-genre') || ''); return; }
        if (t === 'search') { openSearch(); return; }
        if (t === 'search-exit') { exitActiveView(); return; }
        if (t === 'kbd-key') { searchAddKey(el.getAttribute('data-key')); return; }
        if (t === 'kbd-space') { searchAddKey(' '); return; }
        if (t === 'kbd-back') { searchBackspace(); return; }
        if (t === 'kbd-clear') { searchClear(); return; }
        if (t === 'kbd-done') { searchApply(); return; }
        if (t === 'item') { openItem(parseInt(el.getAttribute('data-index'), 10)); return; }
        if (t === 'fav-item') { openFavItem(parseInt(el.getAttribute('data-index'), 10)); return; }
        if (t === 'season') { selectSeason(parseInt(el.getAttribute('data-season'), 10)); return; }
        if (t === 'episode') { openEpisode(parseInt(el.getAttribute('data-ep'), 10)); return; }
        el = el.parentElement;
      }
    });
  }

  function runAction(action, el) {
    if (action === 'login') { doLogin(); }
    else if (action === 'logout') { doLogout(); }
    else if (action === 'openSection') { openSection(el.getAttribute('data-section')); }
    else if (action === 'goHome') { goHome(); }
    else if (action === 'backToList') { closeSeriesDetail(); }
    else if (action === 'reloadSection') { reloadSection(); }
    else if (action === 'stopPlayer') { PlayerService.close(); resumeAfterPlayer(); }
    else if (action === 'openFav') { openFavorites(); }
    else if (action === 'closeFav') { closeFavorites(); }
    else if (action === 'toggleFavSeries') { toggleFavSeries(); }
  }

  /* ================= TELAS ================= */
  function showScreen(name) {
    /* garante que o player não fique tocando em segundo plano ao trocar de tela */
    if (name !== 'screenPlayer' && PlayerService.getCurrentUrl()) {
      PlayerService.close();
    }
    var ids = ['screenLogin', 'screenMenu', 'screenList', 'screenSeries', 'screenFav', 'screenPlayer'];
    for (var i = 0; i < ids.length; i++) $(ids[i]).classList.remove('active');
    $(name).classList.add('active');
    if (name === 'screenSeries') isSeriesDetail = true;
    else if (name !== 'screenPlayer') isSeriesDetail = false;
  }

  /* ---------- Login ---------- */
  function doLogin() {
    var server = XtreamService.normalizeServer($('inServer').value);
    var user = $('inUser').value;
    var pass = $('inPass').value;
    if (!server || !user || !pass) {
      els.loginStatus.className = 'status err';
      els.loginStatus.textContent = 'Preencha servidor, usuário e senha.';
      return;
    }
    els.loginStatus.className = 'status';
    els.loginStatus.textContent = 'Conectando…';
    XtreamService.setCredentials(server, user, pass);
    XtreamService.authenticate(function (info) {
      StorageService.saveCreds(server, user, pass);
      els.loginStatus.className = 'status ok';
      els.loginStatus.textContent = 'Conectado! Entrando…';
      enterMenu(info.user);
    }, function (err) {
      els.loginStatus.className = 'status err';
      els.loginStatus.textContent = err && err.message ? err.message : 'Não foi possível conectar.';
    });
  }

  function doLogout() {
    PlayerService.close();
    XtreamService.invalidateCache();
    StorageService.clearCreds();
    showScreen('screenLogin');
    if ($('inPass')) { $('inPass').value = ''; }
    els.loginStatus.textContent = '';
    els.loginStatus.className = 'status';
    setFocus($('btnLogin'));
  }

  function enterMenu(user) {
    var u = user || {};
    var label = (u.username || '') + ' • ' + (u.exp_date ? 'exp ' + u.exp_date : '');
    els.menuUser.textContent = label || 'conectado';
    showScreen('screenMenu');
    setFocus(document.querySelector('#screenMenu .menu-card'));
  }

  /* ---------- Home / seção ---------- */
  function goHome() {
    favOpen = false;
    XtreamService.invalidateCache();
    showScreen('screenMenu');
    setFocus(document.querySelector('#screenMenu .menu-card'));
  }

  function reloadSection() {
    XtreamService.invalidateCache();
    openSection(state.section, true);
  }

  function openSection(section, force) {
    state.section = section;
    var lb = SECTION_LABELS[section];
    els.listTitle.textContent = lb.title;
    els.listSub.textContent = 'Carregando categorias…';
    showScreen('screenList');
    renderCategoryLoading();
    showLoader('Carregando categorias…');

    XtreamService.loadCategories(section, function (cats) {
      hideLoader();
      state.cats = cats || [];
      renderCategories();
      showSelectHint();
      var first = els.catList.querySelector('.cat-item');
      if (first) setFocus(first);
    }, function (err) {
      hideLoader();
      toast(err && err.message || 'Erro ao carregar categorias', 'err');
      els.listSub.textContent = 'Falha ao carregar';
    }, !!force);
  }

  function renderCategoryLoading() {
    els.catList.innerHTML = '<div class="cat-panel-title">SUBGRUPOS</div><div class="empty" style="padding:20px;font-size:16px">Carregando…</div>';
  }

  function renderCategories() {
    var html = '<div class="cat-panel-title">SUBGRUPOS</div>';
    /* "Todos" */
    html += '<button class="cat-item focusable" data-type="cat" data-id="all" data-focus="true">' +
      '<span class="cat-name">Todos</span><span class="cat-count">' + totalAll() + '</span></button>';
    for (var i = 0; i < state.cats.length; i++) {
      var c = state.cats[i];
      html += '<button class="cat-item focusable" data-type="cat" data-id="' + esc(c.category_id) + '" data-focus="true">' +
        '<span class="cat-name">' + esc(c.category_name || 'Sem nome') + '</span></button>';
    }
    els.catList.innerHTML = html;
    markActiveCat();
  }

  function totalAll() {
    /* não temos contagem sem buscar; mostra-se vazio */
    return '';
  }

  function markActiveCat() {
    var items = els.catList.querySelectorAll('.cat-item');
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute('data-id') === state.catId) items[i].classList.add('active');
      else items[i].classList.remove('active');
    }
  }

  /* estado inicial da listagem: nenhum subgrupo aberto até receber OK */
  function showSelectHint() {
    hide(els.gridLoading);
    state.catId = null;
    state.items = [];
    state.rendered = 0;
    state.filterActive = false;
    state.filterQuery = '';
    state.filterRes = [];
    state.genreFilter = '';
    state.filterDraft = '';
    lastTile = -1;
    els.itemGrid.innerHTML = '';
    els.gridEmpty.textContent = 'Pressione OK em um subgrupo para abrir os itens.';
    show(els.gridEmpty);
    els.listSub.textContent = SECTION_LABELS[state.section].title + ' — escolha um subgrupo e pressione OK';
    markActiveCat();
    updateSearchBar();
  }

  /* ---------- orientação da grade (pôsteres verticais / canais horizontais) ---------- */
  function setGridOrientation() {
    els.itemGrid.classList.remove('portrait');
    els.itemGrid.classList.remove('landscape');
    els.itemGrid.classList.add(state.section === 'live' ? 'landscape' : 'portrait');
  }

  /* ==================================================================
     BUSCA dentro do subgrupo (teclado virtual navegável pelo controle)
     ================================================================== */
  var KBD_ROWS = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['-', '&', '.', '/', "'", '#', '*']
  ];

  function buildKbd() {
    if (!els.kbdRows) return;
    var html = '';
    for (var r = 0; r < KBD_ROWS.length; r++) {
      html += '<div class="kbd-row">';
      for (var c = 0; c < KBD_ROWS[r].length; c++) {
        var kk = KBD_ROWS[r][c];
        html += '<button class="kbd-key focusable" data-type="kbd-key" data-key="' + esc(kk) + '" data-focus="true">' + esc(kk) + '</button>';
      }
      html += '</div>';
    }
    html += '<div class="kbd-row">' +
      '<button class="kbd-action focusable" data-type="kbd-clear" data-focus="true">Limpar</button>' +
      '<button class="kbd-action focusable" data-type="kbd-space" data-focus="true">Espaço</button>' +
      '<button class="kbd-action focusable" data-type="kbd-back" data-focus="true">⌫ Apagar</button>' +
      '<button class="kbd-action focusable" data-type="kbd-done" data-focus="true">Ver resultados ↵</button>' +
      '</div>';
    els.kbdRows.innerHTML = html;
  }

  function openSearch() {
    if (!state.items || !state.items.length) { toast('Este grupo está vazio', 'err'); return; }
    if (!screenIsActive('screenList')) return;
    state.filterDraft = state.filterActive ? state.filterQuery : '';
    state.kbdOpen = true;
    var grp = state.catId === 'all' ? 'Todos' : '';
    for (var i = 0; i < state.cats.length; i++) {
      if (String(state.cats[i].category_id) === String(state.catId)) { grp = state.cats[i].category_name; break; }
    }
    els.kbdGroup.textContent = grp || 'Todos';
    hide(els.catPanel);
    hide(els.gridWrap);
    els.kbd.classList.remove('hidden');
    updateKbdUI();
    var key = els.kbd.querySelector('.kbd-key');
    if (key) setFocus(key);
  }

  function closeSearch() {
    state.kbdOpen = false;
    els.kbd.classList.add('hidden');
    show(els.catPanel);
    show(els.gridWrap);
  }

  /* BACK com o teclado aberto */
  function searchCancel() {
    if (state.filterActive) {
      /* mantém a busca aplicada: apenas fecha o teclado */
      closeSearch();
      updateSearchBar();
      focusFirstTile();
      return;
    }
    closeSearch();
    if (state.items && state.items.length) focusFirstTile();
  }

  function updateKbdUI() {
    els.kbdQuery.textContent = state.filterDraft || '';
    if (!state.filterDraft) { els.kbdCount.textContent = 'digite o nome…'; return; }
    var q = normSearch(state.filterDraft);
    if (!q) { els.kbdCount.textContent = 'digite o nome…'; return; }
    var n = countMatches(q);
    els.kbdCount.textContent = n + (n === 1 ? ' resultado' : ' resultados');
  }

  function countMatches(q) {
    var n = 0;
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      if (it && normSearch(it.name || '').indexOf(q) !== -1) n++;
    }
    return n;
  }

  function searchAddKey(k) {
    var next = (state.filterDraft || '') + k;
    if (next.length > 40) return;
    state.filterDraft = next;
    updateKbdUI();
  }
  function searchBackspace() { state.filterDraft = (state.filterDraft || '').slice(0, -1); updateKbdUI(); }
  function searchClear() { state.filterDraft = ''; updateKbdUI(); }

  function searchApply() {
    var q = (state.filterDraft || '').replace(/^\s+|\s+$/g, '');
    if (!q) { searchCancel(); return; }
    var normQ = normSearch(q);
    if (!countMatches(normQ)) { toast('Nenhum item para "' + q + '"', 'err'); return; }
    state.filterQuery = q;
    state.filterActive = true;
    state.genreFilter = '';
    closeSearch();
    renderFiltered(normQ);
  }

  /* sair da busca/filtro de gênero e voltar à grade completa do subgrupo */
  function exitActiveView() {
    var had = state.filterActive || state.genreFilter;
    state.filterActive = false;
    state.filterQuery = '';
    state.filterRes = [];
    state.genreFilter = '';
    if (!had) return;
    state.rendered = 0;
    renderGrid();
    updateSearchBar();
    var t = els.itemGrid.querySelector('.tile');
    if (t) setFocus(t); else focusFirstTile();
  }

  function renderFiltered(normQ) {
    hide(els.gridLoading);
    var idxs = [];
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      if (it && normSearch(it.name || '').indexOf(normQ) !== -1) idxs.push(i);
    }
    state.filterRes = idxs;
    state.rendered = state.items.length; /* no appendBatch em modo busca */
    setGridOrientation();
    if (!idxs.length) {
      els.itemGrid.innerHTML = '';
      els.gridEmpty.textContent = 'Nenhum item para "' + state.filterQuery + '" neste subgrupo.';
      show(els.gridEmpty);
      updateSearchBar();
      return;
    }
    hide(els.gridEmpty);
    var html = '';
    for (var j = 0; j < idxs.length; j++) html += itemToTile(state.items[idxs[j]], idxs[j]);
    els.itemGrid.innerHTML = html;
    bindBgs(els.itemGrid);
    armSweep();
    updateSearchBar();
    focusFirstTile();
  }

  function updateSearchBar() {
    if (!els.searchBtn || !els.searchTag || !els.sortBtn || !els.genreBtn) return;
    var has = state.items && state.items.length > 0;
    var isSeries = state.section === 'series';
    var free = has && !state.filterActive && !state.genreFilter;
    els.searchBtn.classList.toggle('hidden', !free);
    els.sortBtn.classList.toggle('hidden', !(free && isSeries));
    els.genreBtn.classList.toggle('hidden', !(free && isSeries));
    if (free) {
      els.sortBtn.textContent = 'Ordenar: ' + SORT_LABELS[state.sortMode] + ' ▾';
      els.searchTag.classList.add('hidden');
      return;
    }
    if (state.filterActive && has) {
      els.searchBtn.classList.add('hidden');
      els.sortBtn.classList.add('hidden');
      els.genreBtn.classList.add('hidden');
      els.searchTag.classList.remove('hidden');
      els.searchTag.textContent = 'Busca: "' + state.filterQuery + '" · ' + state.filterRes.length +
        ' item(ns) — OK: sair · BACK: editar';
    } else if (state.genreFilter && has) {
      els.searchBtn.classList.add('hidden');
      els.sortBtn.classList.add('hidden');
      els.genreBtn.classList.add('hidden');
      els.searchTag.classList.remove('hidden');
      var cnt = countGenreMatches(state.genreFilter);
      els.searchTag.textContent = 'Gênero: ' + state.genreFilter + ' · ' + cnt +
        (cnt === 1 ? ' série' : ' séries') + ' — OK: sair · BACK: classificar';
    } else {
      els.searchTag.classList.add('hidden');
    }
  }

  function normSearch(s) {
    return String(s || '').toLowerCase()
      .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e')
      .replace(/[íìîï]/g, 'i').replace(/[óòôõö]/g, 'o')
      .replace(/[úùûü]/g, 'u').replace(/ç/g, 'c')
      .replace(/ñ/g, 'n')
      .replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  /* ==================================================================
     CLASSIFICAR (séries): ordenar + filtro por gênero/categoria
     ================================================================== */
  var SORT_LABELS = { 'default': 'Padrão', 'name': 'Nome A–Z', 'year': 'Ano (novo)', 'rating': 'Nota' };
  var SORT_ORDER = ['default', 'name', 'year', 'rating'];

  function doSort() {
    if (state.section !== 'series') { toast('Ordenação disponível em Séries', 'err'); return; }
    if (!state.items || !state.items.length) return;
    var cur = SORT_ORDER.indexOf(state.sortMode);
    state.sortMode = SORT_ORDER[(cur + 1) % SORT_ORDER.length];
    var arr = state.items.slice();
    if (state.sortMode === 'name') arr.sort(cmpName);
    else if (state.sortMode === 'year') arr.sort(cmpYearDesc);
    else if (state.sortMode === 'rating') arr.sort(cmpRatingDesc);
    state.items = arr;
    state.filterActive = false; state.filterQuery = ''; state.filterRes = [];
    state.genreFilter = '';
    state.rendered = 0;
    renderGrid();
    updateSearchBar();
    focusFirstTile();
    toast('Ordenar por: ' + SORT_LABELS[state.sortMode], 'ok');
  }
  function cmpName(a, b) {
    var x = (a.name || '').toLowerCase(), y = (b.name || '').toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  function yearOf(it) {
    var s = String(it.releaseDate || it.year || '');
    var m = s.match(/[0-9]{4}/);
    return m ? parseInt(m[0], 10) : 0;
  }
  function cmpYearDesc(a, b) { return yearOf(b) - yearOf(a); }
  function cmpRatingDesc(a, b) { return (Number(b.rating) || 0) - (Number(a.rating) || 0); }

  function groupLabel() {
    if (state.catId === 'all' || !state.cats.length) return 'Todos';
    for (var i = 0; i < state.cats.length; i++) {
      if (String(state.cats[i].category_id) === String(state.catId)) return state.cats[i].category_name;
    }
    return 'Todos';
  }

  function openGenres() {
    if (state.section !== 'series') return;
    if (!state.items || !state.items.length) { toast('Grupo vazio', 'err'); return; }
    if (!screenIsActive('screenList')) return;
    state.genreOpen = true;
    els.genreOvGroup.textContent = groupLabel();
    var rows = buildGenreRows();
    els.genreOvRows.innerHTML = rows;
    els.genreOvCount.textContent = state.items.length + ' séries no grupo — escolha uma categoria';
    hide(els.catPanel);
    hide(els.gridWrap);
    els.genreOv.classList.remove('hidden');
    var first = els.genreOv.querySelector('.focusable');
    if (first) setFocus(first);
  }

  function closeGenres() {
    state.genreOpen = false;
    els.genreOv.classList.add('hidden');
    show(els.catPanel);
    show(els.gridWrap);
    updateSearchBar();
  }

  function buildGenreRows() {
    var map = {};
    for (var i = 0; i < state.items.length; i++) {
      var g = state.items[i] && state.items[i].genre;
      if (!g) continue;
      var parts = String(g).split(',');
      for (var k = 0; k < parts.length; k++) {
        var gn = parts[k].replace(/^\s+|\s+$/g, '');
        if (gn) map[gn] = 1;
      }
    }
    var list = [];
    for (var key in map) list.push(key);
    list.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
    if (!list.length) return '<div class="kbd-count">Provedor não informou gêneros nesta lista.</div>';
    var html = '<div class="kbd-row">' +
      '<button class="kbd-action focusable" data-type="genre-item" data-genre="" data-focus="true">✓ Todos os gêneros</button>' +
      '</div>';
    var row = '<div class="kbd-row">';
    var n = 0;
    for (var j = 0; j < list.length; j++) {
      if (n && n % 3 === 0) { html += row + '</div>'; row = '<div class="kbd-row">'; }
      row += '<button class="kbd-action focusable" data-type="genre-item" data-genre="' + esc(list[j]) + '" data-focus="true">' +
        esc(list[j]) + '</button>';
      n++;
    }
    if (n) html += row + '</div>';
    return html;
  }

  function applyGenre(g) {
    state.genreFilter = g || '';
    closeGenres();
    if (!state.genreFilter) { exitActiveView(); return; }
    state.filterActive = false;
    state.filterQuery = '';
    renderGenreFilter(g);
  }

  function countGenreMatches(g) {
    var n = 0, gq = normSearch(g);
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      if (it && normSearch(it.genre || '').indexOf(gq) !== -1) n++;
    }
    return n;
  }

  function renderGenreFilter(g) {
    hide(els.gridLoading);
    var gq = normSearch(g);
    var idxs = [];
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      if (it && normSearch(it.genre || '').indexOf(gq) !== -1) idxs.push(i);
    }
    state.filterRes = idxs;
    state.rendered = state.items.length;
    setGridOrientation();
    if (!idxs.length) {
      els.itemGrid.innerHTML = '';
      els.gridEmpty.textContent = 'Nenhuma série com o gênero "' + g + '".';
      show(els.gridEmpty);
      updateSearchBar();
      return;
    }
    hide(els.gridEmpty);
    var html = '';
    for (var j = 0; j < idxs.length; j++) html += itemToTile(state.items[idxs[j]], idxs[j]);
    els.itemGrid.innerHTML = html;
    bindBgs(els.itemGrid);
    armSweep();
    updateSearchBar();
    focusFirstTile();
  }

  function selectCategory(catId) {
    state.catId = catId;
    state.filterActive = false;
    state.filterQuery = '';
    state.filterRes = [];
    state.genreFilter = '';
    state.filterDraft = '';
    markActiveCat();
    els.listSub.textContent = (state.section === 'live' ? 'Canais' : SECTION_LABELS[state.section].title) +
      (catId !== 'all' ? ' › subgrupo' : ' › todos');
    renderGridLoading();
    state.items = [];
    state.rendered = 0;
    lastTile = -1;

    var catName = 'Todos';
    for (var i = 0; i < state.cats.length; i++) {
      if (String(state.cats[i].category_id) === String(catId)) catName = state.cats[i].category_name;
    }
    els.listSub.textContent = SECTION_LABELS[state.section].title + ' › ' + catName;

    showLoader('Carregando ' + catName + '…');
    XtreamService.loadItems(state.section, catId === 'all' ? null : catId, function (items) {
      hideLoader();
      state.items = items || [];
      state.rendered = 0;
      renderGrid();
      updateSearchBar();
      /* OK no subgrupo: abre e posiciona o foco no 1º item */
      setTimeout(focusFirstTile, 80);
    }, function (err) {
      hideLoader();
      hide(els.gridLoading);
      els.itemGrid.innerHTML = '';
      els.gridEmpty.textContent = 'Erro ao carregar: ' + (err && err.message || 'tente novamente');
      show(els.gridEmpty);
      updateSearchBar();
      toast(err && err.message || 'Erro ao carregar itens', 'err');
    });
  }

  function renderGridLoading() {
    els.itemGrid.innerHTML = '';
    show(els.gridLoading);
    hide(els.gridEmpty);
  }

  function itemToTile(it, index) {
    var isLive = state.section === 'live';
    var img = '';
    var name, sub = '';
    var fav = false;
    if (state.section === 'live' || state.section === 'vod') fav = StorageService.isFav(state.section, it.stream_id);
    else fav = StorageService.isFav('series', it.series_id);
    if (state.section === 'live') {
      name = it.name;
      sub = it.category_name || '';
      img = it.stream_icon;
      return tileHtml(img, name, sub, index, true, fav);
    } else if (state.section === 'vod') {
      name = it.name;
      sub = it.rating && Number(it.rating) > 0 ? '★ ' + it.rating : '';
      img = it.stream_icon;
      return tileHtml(img, name, sub, index, false, fav);
    } else { /* series */
      name = it.name;
      sub = 'T' + (it.season_count || '') + ' E' + (it.episode_run_time || '');
      img = it.cover || it.stream_icon;
      return tileHtml(img, name, sub, index, false, fav);
    }
  }

  function tileHtml(url, name, sub, index, landscape, fav) {
    var cls = 'tile focusable' + (landscape ? ' landscape' : ' portrait');
    return '<button class="' + cls + '" data-type="item" data-index="' + index + '" data-fav="' + (fav ? '1' : '0') + '" data-focus="true">' +
      bgTileHtml(url, letter(name)) +
      '<span class="tile-fav">★</span>' +
      '<span class="tile-meta"><span class="tile-name">' + esc(name) + '</span>' +
      (sub ? '<span class="tile-sub">' + esc(sub) + '</span>' : '') + '</span></button>';
  }

  function renderGrid() {
    hide(els.gridLoading);
    if (!state.items.length) { els.itemGrid.innerHTML = ''; show(els.gridEmpty); return; }
    hide(els.gridEmpty);
    if (state.section === 'live') {
      els.itemGrid.classList.add('landscape');
      els.itemGrid.classList.remove('portrait');
    } else {
      els.itemGrid.classList.add('portrait');
      els.itemGrid.classList.remove('landscape');
    }
    state.rendered = Math.min(state.batch, state.items.length);
    var html = '';
    for (var i = 0; i < state.rendered; i++) {
      html += itemToTile(state.items[i], i);
    }
    els.itemGrid.innerHTML = html;
    bindBgs(els.itemGrid);
    armSweep();
    /* mantém o foco no subgrupo; usuário entra na grade com → */
  }

  function appendBatch() {
    if (state.rendered >= state.items.length) return;
    var next = Math.min(state.rendered + state.batch, state.items.length);
    var html = '';
    for (var i = state.rendered; i < next; i++) html += itemToTile(state.items[i], i);
    els.itemGrid.insertAdjacentHTML('beforeend', html);
    state.rendered = next;
    bindBgs(els.itemGrid);
    armSweep();
  }

  function focusFirstTile() {
    var first = els.itemGrid.querySelector('.tile');
    if (first) setFocus(first);
    else setFocus(els.catList.querySelector('.cat-item'));
  }

  /* ---------- abrir item ---------- */
  function openItem(index) {
    var it = state.items[index];
    if (!it) return;
    if (state.section === 'live') {
      lastTile = index;
      nowPlayingRec = buildFavRecord('live', it);
      PlayerService.play(XtreamService.liveStreamUrl(it), it.name, { live: true });
    } else if (state.section === 'vod') {
      lastTile = index;
      nowPlayingRec = buildFavRecord('vod', it);
      PlayerService.play(XtreamService.vodStreamUrl(it), it.name, { live: false });
    } else {
      openSeriesDetail(it);
    }
  }

  /* ---------- detalhe de série ---------- */
  function openSeriesDetail(series) {
    state.seriesExt = series.container_extension || 'mp4';
    curSeriesRec = buildFavRecord('series', series);
    showLoader('Carregando série…');
    XtreamService.getSeriesInfo(series.series_id, function (info) {
      hideLoader();
      state.seriesCache[series.series_id] = info;
      renderSeriesDetail(info);
    }, function (err) {
      hideLoader();
      toast(err && err.message || 'Erro ao carregar série', 'err');
    });
  }

  function episodesFromInfo(info) {
    /* info.episodes: { "1": [ {id,title,info:{movie_image,...}} ], "2": [...] } */
    var eps = {};
    var ep = info.episodes || {};
    for (var season in ep) {
      if (Object.prototype.hasOwnProperty.call(ep, season)) {
        eps[season] = ep[season] || [];
      }
    }
    return eps;
  }

  function renderSeriesDetail(info) {
    var inf = info.info || info;
    var name = inf.name || 'Série';
    els.serTitle.textContent = name;
    els.serSub.textContent = (inf.genre || 'Série');
    state.seriesExt = inf.container_extension || 'mp4';
    var seasons = episodesFromInfo(info);
    var seasonKeys = Object.keys(seasons);
    if (!seasonKeys.length) { seasonKeys = ['1']; seasons['1'] = []; }
    activeSeason = parseInt(seasonKeys[0], 10);
    seriesEpisodes = seasons;

    var cover = inf.cover || '';
    var plot = inf.plot || '';
    var year = inf.year ? ' • ' + inf.year : '';
    var rating = inf.rating && Number(inf.rating) > 0 ? ' • ★ ' + inf.rating : '';
    var cast = inf.cast ? ' • ' + inf.cast : '';

    var html = '<div class="ser-hero">' +
      '<div class="sh-poster" data-url="' + esc(cover) + '">' +
      '<span class="tile-ph">' + letter(name) + '</span></div>' +
      '<div class="sh-info">' + esc(year + rating) + '</div>' +
      '<div class="sh-plot">' + (plot ? esc(plot) : '') + '</div>' +
      '</div>' +
      '<div class="ser-right">' +
      '<div class="season-row" id="seasonRow"></div>' +
      '<div class="ser-episodes" id="epRow"></div>' +
      '</div>';

    els.serBody.innerHTML = html;
    bindBgs(els.serBody);
    renderSeasonChips();
    renderEpisodes();
    armSweep();
    if (curSeriesRec) {
      curSeriesRec.name = name;
      curSeriesRec.img = cover || curSeriesRec.img;
      curSeriesRec.ext = inf.container_extension || 'mp4';
    }
    refreshSeriesFavBtn();
    showScreen('screenSeries');
    setFocus(document.querySelector('#screenSeries .season-chip'));
  }

  function renderSeasonChips() {
    var row = $('seasonRow');
    var html = '';
    var keys = Object.keys(seriesEpisodes);
    for (var i = 0; i < keys.length; i++) {
      var s = keys[i];
      html += '<button class="season-chip focusable' + (parseInt(s, 10) === activeSeason ? ' active' : '') +
        '" data-type="season" data-season="' + esc(s) + '" data-focus="true">' +
        'Temporada ' + esc(s) + '</button>';
    }
    row.innerHTML = html;
  }

  function renderEpisodes() {
    var row = $('epRow');
    var eps = seriesEpisodes[String(activeSeason)] || [];
    if (!eps.length) { row.innerHTML = '<div class="empty">Sem episódios nesta temporada.</div>'; return; }
    var html = '';
    for (var i = 0; i < eps.length; i++) {
      var ep = eps[i];
      var eInfo = ep.info || {};
      var name = ep.title || ('Episódio ' + (ep.episode_num || i + 1));
      var url = eInfo.movie_image || ep.movie_image;
      html += '<button class="tile focusable landscape" data-type="episode" data-ep="' + i + '" data-focus="true">' +
        bgTileHtml(url, 'EP ' + esc(ep.episode_num || i + 1)) +
        '<span class="tile-meta"><span class="tile-name">' + esc(name) + '</span>' +
        (eInfo.duration ? '<span class="tile-sub">' + esc(eInfo.duration) + ' min</span>' : '') +
        '</span></button>';
    }
    row.innerHTML = html;
    bindBgs(row);
    armSweep();
  }

  function selectSeason(season) {
    activeSeason = season;
    renderSeasonChips();
    renderEpisodes();
    var first = $('epRow') && $('epRow').querySelector('.tile');
    if (first) setFocus(first);
  }

  function openEpisode(index) {
    var key = String(activeSeason);
    var eps = seriesEpisodes[key] || [];
    var ep = eps[index];
    if (!ep) return;
    lastEp = { season: activeSeason, ep: index };
    var name = (ep.title || 'Episódio ' + (ep.episode_num || index + 1)) + ' • T' + activeSeason;
    nowPlayingRec = curSeriesRec;
    PlayerService.play(XtreamService.seriesStreamUrl(ep, state.seriesExt || 'mp4'), name, { live: false });
  }

  function closeSeriesDetail() {
    if (favOpen) {
      /* veio de Favoritos → volta para a grade de favoritos */
      showScreen('screenFav');
      renderFavs();
      var tt = els.favGrid.querySelector('.tile');
      if (tt) setFocus(tt);
      else setFocus(document.querySelector('#screenFav .btn-back'));
      return;
    }
    showScreen('screenList');
    focusFirstTile();
  }

  /* ================= FAVORITOS ================= */
  function buildFavRecord(t, it) {
    if (!it) return null;
    if (t === 'live') {
      return { t: 'live', id: String(it.stream_id), name: it.name || '', img: it.stream_icon || '', sub: it.category_name || '', ext: '' };
    }
    if (t === 'vod') {
      return { t: 'vod', id: String(it.stream_id), name: it.name || '', img: it.stream_icon || '', sub: it.category_name || '', ext: it.container_extension || 'mp4' };
    }
    return { t: 'series', id: String(it.series_id), name: it.name || '', img: it.cover || it.stream_icon || '', sub: '', ext: it.container_extension || 'mp4' };
  }

  function toggleFavRecord(rec, done) {
    if (!rec) return;
    var on = StorageService.isFav(rec.t, rec.id);
    if (on) {
      StorageService.favRemove(rec.t, rec.id);
      toast('Removido dos favoritos', null, 1400);
      if (done) done(false);
    } else {
      StorageService.favAdd(rec);
      toast('Adicionado aos favoritos ★', 'ok', 1400);
      if (done) done(true);
    }
  }

  /* botão azul/amarelo conforme o contexto */
  function toggleFavFocused() {
    if (!focusedEl) return;
    var type = focusedEl.getAttribute('data-type');
    if (type === 'item') {
      var idx = parseInt(focusedEl.getAttribute('data-index'), 10);
      var it = state.items[idx];
      if (!it) return;
      var rec = buildFavRecord(state.section, it);
      toggleFavRecord(rec, function (fav) {
        focusedEl.setAttribute('data-fav', fav ? '1' : '0');
      });
      return;
    }
    if (type === 'fav-item') {
      var i2 = parseInt(focusedEl.getAttribute('data-index'), 10);
      var list = StorageService.favAll();
      var rec2 = list[i2];
      if (!rec2) return;
      StorageService.favRemove(rec2.t, rec2.id);
      toast('Removido dos favoritos', null, 1200);
      var after = StorageService.favAll();
      if (!after.length) {
        renderFavs();
        setFocus(document.querySelector('#screenFav .btn-back'));
        return;
      }
      renderFavs();
      var target = i2 < after.length ? i2 : after.length - 1;
      var tt = els.favGrid.querySelector('.tile[data-index="' + target + '"]');
      if (tt) setFocus(tt);
      else setFocus(document.querySelector('#screenFav .btn-back'));
      return;
    }
    if (isSeriesDetail && curSeriesRec) { toggleFavSeries(); return; }
    toast('Selecione um item e pressione azul/amarelo para favoritar', null, 2200);
  }

  function toggleFavNowPlaying() {
    if (!nowPlayingRec) { toast('Nada para favoritar agora', null, 1500); return; }
    toggleFavRecord(nowPlayingRec, function (fav) {
      if (isSeriesDetail) refreshSeriesFavBtn();
      if (screenIsActive('screenFav')) renderFavs();
    });
    PlayerService.pokeOverlay();
  }

  /* botão "Favoritar" no topo do detalhe de série */
  function toggleFavSeries() {
    if (!curSeriesRec) { toast('Nenhuma série selecionada', 'err', 1500); return; }
    toggleFavRecord(curSeriesRec, function () { refreshSeriesFavBtn(); });
  }
  function refreshSeriesFavBtn() {
    if (!els.serFavBtn || !curSeriesRec) return;
    els.serFavBtn.textContent = StorageService.isFav(curSeriesRec.t, curSeriesRec.id) ? '★ Favorita' : '☆ Favoritar';
  }

  function favTileHtml(rec, index) {
    var label = rec.t === 'live' ? 'Canal' : rec.t === 'vod' ? 'Filme' : 'Série';
    var sub = rec.sub ? label + ' · ' + rec.sub : label;
    return '<button class="tile focusable portrait" data-type="fav-item" data-index="' + index + '" data-fav="1" data-focus="true">' +
      bgTileHtml(rec.img, letter(rec.name)) +
      '<span class="tile-fav">★</span>' +
      '<span class="tile-meta"><span class="tile-name">' + esc(rec.name || 'Sem nome') + '</span>' +
      '<span class="tile-sub">' + esc(sub) + '</span></span></button>';
  }

  function renderFavs() {
    var list = StorageService.favAll();
    if (els.favSub) els.favSub.textContent = list.length + (list.length === 1 ? ' favorito' : ' favoritos');
    if (!list.length) {
      els.favGrid.innerHTML = '';
      show(els.favEmpty);
      return;
    }
    hide(els.favEmpty);
    var html = '';
    for (var i = 0; i < list.length; i++) html += favTileHtml(list[i], i);
    els.favGrid.innerHTML = html;
    bindBgs(els.favGrid);
    armSweep();
  }

  function openFavorites() {
    favOpen = true;
    state.kbdOpen = false;
    state.genreOpen = false;
    showScreen('screenFav');
    renderFavs();
    var t = els.favGrid.querySelector('.tile');
    if (t) setFocus(t);
    else setFocus(document.querySelector('#screenFav .btn-back'));
  }

  function closeFavorites() {
    favOpen = false;
    nowPlayingRec = null;
    showScreen('screenMenu');
    var c = document.querySelector('#screenMenu .menu-card');
    if (c) setFocus(c);
  }

  function openFavItem(index) {
    var list = StorageService.favAll();
    var rec = list[index];
    if (!rec) return;
    lastFavIndex = index;
    nowPlayingRec = rec;
    if (rec.t === 'live') {
      PlayerService.play(XtreamService.liveStreamUrl({ stream_id: rec.id }), rec.name, { live: true });
    } else if (rec.t === 'vod') {
      PlayerService.play(XtreamService.vodStreamUrl({ stream_id: rec.id, container_extension: rec.ext || 'mp4' }), rec.name, { live: false });
    } else {
      openSeriesDetail({ series_id: rec.id, name: rec.name, cover: rec.img, container_extension: rec.ext || 'mp4', stream_icon: rec.img });
    }
  }

  function zapFavLive(dir) {
    var list = StorageService.favAll();
    var lives = [];
    for (var i = 0; i < list.length; i++) if (list[i].t === 'live') lives.push(list[i]);
    if (!lives.length) { toast('Nenhum canal favorito', 'err', 1600); return; }
    var curUrl = PlayerService.getCurrentUrl();
    var idx = -1;
    for (var j = 0; j < lives.length; j++) {
      if (XtreamService.liveStreamUrl({ stream_id: lives[j].id }) === curUrl) { idx = j; break; }
    }
    if (idx === -1) idx = 0;
    var nidx = (idx + dir + lives.length) % lives.length;
    var rec = lives[nidx];
    lastFavIndex = nidx;
    nowPlayingRec = rec;
    PlayerService.play(XtreamService.liveStreamUrl({ stream_id: rec.id }), rec.name, { live: true });
    toast('Canal: ' + rec.name, null, 1400);
  }

  function handlePlayerEnded() {
    if (!screenIsActive('screenPlayer')) return;
    PlayerService.close();
    toast('Fim da reprodução — voltando…', 'ok', 1600);
    resumeAfterPlayer();
  }

  /* ================= teclado (público) ================= */
  function handleKey(keyCode) {
    /* se estiver digitando em um campo, deixa backspace apagar texto */
    var ae = document.activeElement;
    var typing = ae && ae.tagName === 'INPUT';
    if (typing && keyCode === 8) return;

    var inPlayer = !!PlayerService.getCurrentUrl();
    if (inPlayer) {
      if (keyCode === 461 || keyCode === 8 || keyCode === 27) { PlayerService.close(); resumeAfterPlayer(); return; }
      if (keyCode === 33) { zapChannel(-1); return; }
      if (keyCode === 34) { zapChannel(1); return; }
      if (keyCode === 405 || keyCode === 406) { toggleFavNowPlaying(); return; }
      /* qualquer outra tecla mostra a UI do player por 3 s (sem legendas depois) */
      PlayerService.pokeOverlay();
      return;
    }
    /* dentro de campo de texto: só sobe/desce muda de campo */
    if (focusedEl && focusedEl.tagName === 'INPUT') {
      if (keyCode === 38) { moveFocus(0, -1); return; }
      if (keyCode === 40) { moveFocus(0, 1); return; }
      if (keyCode === 37 || keyCode === 39) { return; }
    }
    switch (keyCode) {
      case 37: moveFocus(-1, 0); break;   /* esquerda */
      case 38: moveFocus(0, -1); break;   /* cima */
      case 39: moveFocus(1, 0); break;    /* direita */
      case 40: moveFocus(0, 1); break;    /* baixo */
      case 13: pressOk(); break;          /* OK */
      case 461: case 8: case 27: pressBack(); break; /* back/esc */
      case 405: case 406: toggleFavFocused(); break; /* amarelo/azul: favoritar */
      default: break;
    }
  }

  function zapChannel(dir) {
    if (!PlayerService.getCurrentUrl()) return;
    if (favOpen && screenIsActive('screenFav')) {
      if (PlayerService.isLive()) zapFavLive(dir);
      else toast('Use PgUp/PgDn para trocar de canal', null, 1500);
      return;
    }
    if (state.section !== 'live' || !state.items.length) {
      toast('Use PgUp/PgDn para trocar de canal', null, 1500);
      return;
    }
    var idx = -1;
    for (var i = 0; i < state.items.length; i++) {
      if (XtreamService.liveStreamUrl(state.items[i]) === PlayerService.getCurrentUrl()) { idx = i; break; }
    }
    if (idx === -1) idx = 0;
    var nidx = (idx + dir + state.items.length) % state.items.length;
    var it = state.items[nidx];
    PlayerService.play(XtreamService.liveStreamUrl(it), it.name, { live: true });
    toast('Canal: ' + it.name, null, 1400);
  }

  /* autologin na inicialização (se houver credenciais salvas, tenta conectar) */
  function tryAutoLogin() {
    var c = StorageService.loadCreds();
    if (c.server && c.user && c.pass) {
      XtreamService.setCredentials(c.server, c.user, c.pass);
      els.loginStatus.textContent = 'Conectando automaticamente…';
      XtreamService.authenticate(function (info) {
        els.loginStatus.className = 'status ok';
        enterMenu(info.user);
      }, function () {
        els.loginStatus.className = '';
        els.loginStatus.textContent = 'Sessão expirada — entre novamente.';
      });
    }
  }

  function getFocused() { return focusedEl; }

  return {
    init: init,
    handleKey: handleKey,
    setFocus: setFocus,
    getFocused: getFocused,
    tryAutoLogin: tryAutoLogin,
    goHome: goHome
  };
})();
