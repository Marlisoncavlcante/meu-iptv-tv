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
  function maybeProxyUrl(url) {
    try {
      if (window.WEB_PROXY_ENABLED && window.webProxyPrefix) {
        return window.webProxyPrefix + encodeURIComponent(url);
      }
    } catch (e) {}
    return url;
  }

  /* XHR simples (webOS não garante fetch) */
  function xhrJson(url, onOk, onErr, timeoutMs) {
    url = maybeProxyUrl(url);
    var xhr = new XMLHttpRequest();
    var done = false;
    var timer = null;
    xhr.open('GET', url, true);
    xhr.timeout = timeoutMs || 25000;
    xhr.responseType = 'json';
    xhr.onload = function () {
      if (done) return; done = true;
      if (timer) clearTimeout(timer);
      if (xhr.status >= 200 && xhr.status < 300) {
        onOk(xhr.response || {});
      } else {
        onErr(new Error('HTTP ' + xhr.status));
      }
    };
    xhr.onerror = function () { if (done) return; done = true; if (timer) clearTimeout(timer); onErr(new Error('Erro de rede')); };
    xhr.ontimeout = function () { if (done) return; done = true; onErr(new Error('Tempo esgotado')); };
    timer = setTimeout(function () { try { xhr.abort(); } catch (e) {} }, (timeoutMs || 25000) + 1500);
    xhr.send();
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
