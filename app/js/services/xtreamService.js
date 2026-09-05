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

  function candidateUrls(url) {
    var out = [url];
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
    var tmo = timeoutMs || 25000;
    var idx = 0;
    var proxyOn = false;
    try { proxyOn = !!window.WEB_PROXY_ENABLED; } catch (e) {}
    var tried = [];

    /* tenta direto primeiro e, com proxy ativo, cada proxy em ordem.
       Cada tentativa tem no maximo metade do timeout total (para o
       login nao demorar demais quando tudo falha). */
    function attempt() {
      var current = list[idx++];
      if (!current) {
        var last = tried.length ? tried[tried.length - 1] : '';
        var msg = 'Erro de rede ao conectar';
        if (last) msg += ' (' + last + ')';
        if (proxyOn) {
          msg += '. Falhou direto e via proxy: confira o endereco do servidor ou tente novamente.';
        } else {
          msg += '. Se o painel e HTTP (nao HTTPS) ou bloqueia o navegador, marque "usar proxy CORS" no login.';
        }
        onErr(new Error(msg));
        return;
      }
      var xhr = new XMLHttpRequest();
      var done = false;
      var timer = null;
      var step = Math.max(8000, Math.round(tmo / 2));
      xhr.open('GET', current, true);
      xhr.timeout = step;
      xhr.responseType = 'json';
      xhr.onload = function () {
        if (done) return; done = true;
        if (timer) clearTimeout(timer);
        if (xhr.status >= 200 && xhr.status < 300) {
          onOk(xhr.response || {});
        } else {
          tried.push('HTTP ' + xhr.status);
          attempt();
        }
      };
      xhr.onerror = function () {
        if (done) return; done = true; if (timer) clearTimeout(timer);
        tried.push(current === url ? 'rede direta' : 'proxy');
        attempt();
      };
      xhr.ontimeout = function () {
        if (done) return; done = true;
        tried.push('tempo');
        attempt();
      };
      timer = setTimeout(function () { try { xhr.abort(); } catch (e) {} }, step + 1500);
      xhr.send();
    }
    attempt();
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
