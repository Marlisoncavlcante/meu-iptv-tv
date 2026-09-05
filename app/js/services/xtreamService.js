/* ============================================================
   xtreamService.js — API Xtream Codes (player_api.php)
   Filmes (VOD), Séries e Canais ao vivo com subgrupos/miniaturas
   Compatível com LG webOS (ES5, sem Promise — usa callbacks)
   ============================================================ */
var XtreamService = (function () {

  var creds = { server: '', user: '', pass: '' };
  var serverInfo = null;

  function normalizeServer(s) {
    s = String(s || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    return s.replace(/\/+$/, '');
  }

  function setCredentials(server, user, pass) {
    creds.server = normalizeServer(server);
    creds.user = String(user || '').trim();
    creds.pass = String(pass || '');
    serverInfo = null;
  }
  function getCredentials() { return { server: creds.server, user: creds.user, pass: creds.pass }; }
  function getServerInfo() { return serverInfo; }
  function isLogged() { return !!(creds.server && creds.user && creds.pass); }

  /* Proxy CORS (apenas versão WEB): alguns servidores IPTV bloqueiam
     o navegador. Quando ativo, as chamadas da API passam por um proxy
     público de CORS. Ativado pelo usuário na tela de login (web.js). */
  /* Lista de proxies CORS publicos (somente versao WEB).
     Painéis Xtream normalmente nao enviam cabecalhos CORS e muitos so
     falam HTTP (a pagina do site e HTTPS -> mixed content bloqueado).
     Cada chamada tenta a URL direta e, com o proxy ativo, tenta cada
     proxy abaixo em ordem ate conseguir. */
  function proxyBaseUrls() {
    return [
      'https://corsproxy.io/?url=',
      'https://api.allorigins.win/raw?url=',
      'https://api.codetabs.com/v1/proxy?quest='
    ];
  }

  function httpsUpgrade(url) {
    if (url.indexOf('http://') === 0) {
      return 'https://' + url.substring(7);
    }
    return '';
  }

  function candidateUrls(url) {
    var out = [url];
    var up = httpsUpgrade(url);
    if (up) out.push(up);
    try {
      if (window.WEB_PROXY_ENABLED) {
        var enc = encodeURIComponent(url);
        var list = (window.webProxyPrefixes && window.webProxyPrefixes.length)
          ? window.webProxyPrefixes : proxyBaseUrls();
        for (var i = 0; i < list.length; i++) {
          if (list[i]) out.push(list[i] + enc);
        }
      }
    } catch (e) {}
    return out;
  }

  /* XHR simples (webOS não garante fetch) */
  function xhrJson(url, onOk, onErr, timeoutMs) {
    var list = candidateUrls(url);
    var upUrl = httpsUpgrade(url);
    var tmo = timeoutMs || 25000;
    var step = Math.max(15000, tmo);
    var proxyOn = false;
    try { proxyOn = !!window.WEB_PROXY_ENABLED; } catch (e) {}
    var pending = list.length;
    var done = false;
    var xhrs = [];
    var reasons = [];

    function abortAll() {
      for (var i = 0; i < xhrs.length; i++) { try { xhrs[i].abort(); } catch (e2) {} }
    }

    function success(resp) {
      if (done) return;
      done = true; abortAll();
      onOk(resp);
    }

    function fail(msg) {
      if (done) return;
      done = true; abortAll();
      onErr(new Error(msg));
    }

    function tryNext(current, label) {
      if (done) return;
      var xhr = new XMLHttpRequest();
      xhrs.push(xhr);
      xhr.open('GET', current, true);
      xhr.timeout = step;
      xhr.responseType = 'json';
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          success(xhr.response || {});
        } else if (current === url || current === upUrl) {
          /* resposta direta do proprio servidor: proxy nao mudaria isso */
          fail('Servidor respondeu HTTP ' + xhr.status);
        } else {
          /* erro do proxy publico (limite, bloqueio etc.) -> tenta os outros */
          if (done) return;
          reasons.push(label + ':' + xhr.status);
          pending--;
          if (pending <= 0) buildFail();
        }
      };
      xhr.onerror = function () {
        if (done) return;
        reasons.push(label);
        pending--;
        if (pending <= 0) buildFail();
      };
      xhr.ontimeout = function () {
        if (done) return;
        reasons.push('tempo');
        pending--;
        if (pending <= 0) buildFail();
      };
      setTimeout(function () {
        if (!done && xhr.readyState > 0 && xhr.readyState < 4) {
          try { xhr.abort(); } catch (e3) {}
        }
      }, step + 2000);
      try { xhr.send(); } catch (e4) {
        if (done) return;
        reasons.push(label);
        pending--;
        if (pending <= 0) buildFail();
      }
    }

    function buildFail() {
      var seen = [];
      for (var i = 0; i < reasons.length; i++) {
        if (seen.indexOf(reasons[i]) < 0) seen.push(reasons[i]);
      }
      var msg = 'Erro de rede ao conectar';
      if (seen.length) msg += ' (tentativas: ' + seen.join('/') + ')';
      if (proxyOn) {
        msg += '. Falhou direto, HTTPS e via proxy. Confira o endereco do servidor ou informe um proxy proprio no campo do login.';
      } else {
        msg += '. Se o painel e HTTP ou bloqueia o navegador, marque "usar proxy CORS" no login.';
      }
      fail(msg);
    }

    for (var idx = 0; idx < list.length; idx++) {
      (function (current) {
        var label = current === url ? 'direto' : (current === upUrl ? 'https' : 'proxy' + idx);
        tryNext(current, label);
      })(list[idx]);
    }
    if (list.length === 0) fail('URL vazia');
  }

  function apiUrl(action, extra) {
    var base = creds.server + '/player_api.php';
    var qs = 'username=' + encodeURIComponent(creds.user) + '&password=' + encodeURIComponent(creds.pass);
    if (action) qs += '&action=' + encodeURIComponent(action);
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) {
          qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(extra[k]);
        }
      }
    }
    return base + '?' + qs;
  }

  /* ---- Autenticação + informações ---- */
  function authenticate(onOk, onErr) {
    xhrJson(apiUrl(null, null), function (data) {
      var ui = data.user_info || {};
      var si = data.server_info || {};
      serverInfo = si;
      if (ui.auth === 1 || ui.auth === '1' || String(ui.auth) === 'true') {
        onOk({ user: ui, server: si });
      } else {
        onErr(new Error(ui.auth === 0 || ui.auth === '0' ? 'Usuário ou senha inválidos' : 'Falha na autenticação'));
      }
    }, onErr, 30000);
  }

  /* ---- Streams ao vivo (canais) ---- */
  function getLiveCategories(onOk, onErr) {
    xhrJson(apiUrl('get_live_categories'), onOk, onErr);
  }
  function getLiveStreams(catId, onOk, onErr) {
    xhrJson(apiUrl('get_live_streams', catId ? { category_id: catId } : null), onOk, onErr);
  }

  /* ---- Filmes (VOD) ---- */
  function getVodCategories(onOk, onErr) {
    xhrJson(apiUrl('get_vod_categories'), onOk, onErr);
  }
  function getVodStreams(catId, onOk, onErr) {
    xhrJson(apiUrl('get_vod_streams', catId ? { category_id: catId } : null), onOk, onErr);
  }
  function getVodInfo(vodId, onOk, onErr) {
    xhrJson(apiUrl('get_vod_info', { vod_id: vodId }), onOk, onErr);
  }

  /* ---- Séries ---- */
  function getSeriesCategories(onOk, onErr) {
    xhrJson(apiUrl('get_series_categories'), onOk, onErr);
  }
  function getSeries(catId, onOk, onErr) {
    xhrJson(apiUrl('get_series', catId ? { category_id: catId } : null), onOk, onErr);
  }
  function getSeriesInfo(seriesId, onOk, onErr) {
    xhrJson(apiUrl('get_series_info', { series_id: seriesId }), onOk, onErr);
  }

  /* ---------- URLs de reprodução ---------- */
  function liveStreamUrl(stream) {
    return creds.server + '/live/' + encodeURIComponent(creds.user) + '/' + encodeURIComponent(creds.pass) + '/' + stream.stream_id + '.m3u8';
  }
  function vodStreamUrl(stream) {
    var ext = stream.container_extension || 'mp4';
    return creds.server + '/movie/' + encodeURIComponent(creds.user) + '/' + encodeURIComponent(creds.pass) + '/' + stream.stream_id + '.' + ext;
  }
  function seriesStreamUrl(episode, fallbackExt) {
    var ext = episode.container_extension || fallbackExt || 'mp4';
    return creds.server + '/series/' + encodeURIComponent(creds.user) + '/' + encodeURIComponent(creds.pass) + '/' + episode.id + '.' + ext;
  }

  /* Esquema do servidor (http ou https) */
  function serverScheme() {
    return (/^https:/i.test(creds.server)) ? 'https:' : 'http:';
  }

  /* Normalização de imagem (cobre stream_icon ausente/relativo).
     URLs "//..." herdam o esquema do servidor (muitos painéis só falam http). */
  function imageOrPlaceholder(url) {
    if (!url || /^\s*$/.test(url)) return '';
    url = String(url).trim();
    if (/^\/\//.test(url)) url = serverScheme() + url;
    else if (/^\//.test(url) && creds.server) url = creds.server + url;
    return url;
  }

  /* Variantes http/https da mesma imagem para tentativa de fallback */
  function imageVariants(url) {
    url = imageOrPlaceholder(url);
    if (!url) return [];
    var out = [url];
    if (/^https:/i.test(url)) { out.push('http:' + url.substring(6)); }
    else if (/^http:/i.test(url)) { out.push('https:' + url.substring(5)); }
    return out;
  }

  /* ---- cache em memória para navegação rápida ---- */
  var memCache = {};
  function cachedFetch(key, fetcher, onOk, onErr, force) {
    if (!force && memCache[key]) { onOk(memCache[key]); return; }
    fetcher(function (data) {
      memCache[key] = data;
      onOk(data);
    }, function (err) {
      onErr(err);
    });
  }
  function invalidateCache() { memCache = {}; }

  /* lista os subgrupos (categorias) dado o tipo */
  function loadCategories(type, onOk, onErr, force) {
    if (type === 'live') return cachedFetch('liveCats', getLiveCategories, onOk, onErr, force);
    if (type === 'vod') return cachedFetch('vodCats', getVodCategories, onOk, onErr, force);
    if (type === 'series') return cachedFetch('seriesCats', getSeriesCategories, onOk, onErr, force);
    onErr(new Error('Tipo desconhecido'));
  }

  /* lista os itens (streams/séries) de um subgrupo */
  function loadItems(type, catId, onOk, onErr, force) {
    var key = type + '_' + (catId || 'all');
    if (type === 'live') return cachedFetch(key, function (ok, er) { getLiveStreams(catId, ok, er); }, onOk, onErr, force);
    if (type === 'vod') return cachedFetch(key, function (ok, er) { getVodStreams(catId, ok, er); }, onOk, onErr, force);
    if (type === 'series') return cachedFetch(key, function (ok, er) { getSeries(catId, ok, er); }, onOk, onErr, force);
    onErr(new Error('Tipo desconhecido'));
  }

  return {
    setCredentials: setCredentials,
    getCredentials: getCredentials,
    getServerInfo: getServerInfo,
    isLogged: isLogged,
    authenticate: authenticate,
    loadCategories: loadCategories,
    loadItems: loadItems,
    getLiveCategories: getLiveCategories,
    getLiveStreams: getLiveStreams,
    getVodCategories: getVodCategories,
    getVodStreams: getVodStreams,
    getVodInfo: getVodInfo,
    getSeriesCategories: getSeriesCategories,
    getSeries: getSeries,
    getSeriesInfo: getSeriesInfo,
    liveStreamUrl: liveStreamUrl,
    vodStreamUrl: vodStreamUrl,
    seriesStreamUrl: seriesStreamUrl,
    imageOrPlaceholder: imageOrPlaceholder,
    imageVariants: imageVariants,
    serverScheme: serverScheme,
    invalidateCache: invalidateCache,
    normalizeServer: normalizeServer
  };
})();
