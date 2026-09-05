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
      { name: 'corsproxy.io',  url: 'https://corsproxy.io/?url=' },
      { name: 'allorigins',    url: 'https://api.allorigins.win/raw?url=' },
      { name: 'codetabs',      url: 'https://api.codetabs.com/v1/proxy?quest=' },
      { name: 'corsproxy.org', url: 'https://corsproxy.org/?url=' }
    ];
  }

  function httpsUpgrade(url) {
    if (url.indexOf('http://') === 0) {
      return 'https://' + url.substring(7);
    }
    return '';
  }

  /* Lista de proxies realmente ativos na versao web. O web.js grava em
     window.webProxyPrefixes (URLs) e window.webProxyNames (nomes);
     sem esses globais (LG/Android) nao ha proxy — la se usa acesso direto.
     custom = true quando o usuario informou o proprio proxy (Worker),
     cujas respostas sao do servidor (autoritativas). */
  function webProxyList() {
    var urls = [];
    var names = [];
    var custom = false;
    try {
      if (window.WEB_PROXY_ENABLED) {
        custom = !!window.WEB_PROXY_CUSTOM;
        if (window.webProxyPrefixes && window.webProxyPrefixes.length) {
          urls = window.webProxyPrefixes;
          names = (window.webProxyNames && window.webProxyNames.length === urls.length)
            ? window.webProxyNames : [];
        } else {
          var base = proxyBaseUrls();
          for (var i = 0; i < base.length; i++) { urls.push(base[i].url); names.push(base[i].name); }
        }
      }
    } catch (e) {}
    return { urls: urls, names: names, custom: custom };
  }

  function candidateUrls(url) {
    var out = [{ url: url, kind: 'direct', label: 'direto', authoritative: true }];
    var up = httpsUpgrade(url);
    if (up) out.push({ url: up, kind: 'https', label: 'https', authoritative: true });
    var pl = webProxyList();
    for (var i = 0; i < pl.urls.length; i++) {
      if (pl.urls[i]) {
        out.push({
          url: pl.urls[i] + encodeURIComponent(url),
          kind: 'proxy',
          label: pl.names[i] || ('proxy' + (i + 1)),
          authoritative: !!pl.custom
        });
      }
    }
    return out;
  }

  /* XHR simples (webOS não garante fetch).
     Dispara as tentativas (direto, https e proxies) em paralelo.
     Resposta HTTP do proprio servidor (direto/https) e final — um proxy
     nao mudaria um 401/404. Falha/erro de proxy apenas conta a tentativa,
     ate nao sobrar nenhuma (ai monta o resumo nomeado). */
  function xhrJson(url, onOk, onErr, timeoutMs) {
    var list = candidateUrls(url);
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

    function tryNext(entry) {
      if (done) return;
      var xhr = new XMLHttpRequest();
      xhrs.push(xhr);
      xhr.open('GET', entry.url, true);
      xhr.timeout = step;
      xhr.onload = function () {
        if (done) return;
        var raw = (xhr.responseText !== undefined ? xhr.responseText : xhr.response) || '';
        var obj = null;
        try {
          var parsed = JSON.parse(raw);
          if (parsed !== null && typeof parsed === 'object') obj = parsed;
        } catch (e) {}
        var okStatus = (xhr.status >= 200 && xhr.status < 300);
        if (okStatus && obj !== null) {
          success(obj);
        } else if (entry.authoritative) {
          /* resposta do proprio servidor (ou do proxy proprio do usuario,
             ex.: Cloudflare Worker): proxy nenhum mudaria um 401/404 */
          if (okStatus) {
            fail(entry.kind === 'proxy'
              ? 'Proxy proprio devolveu conteudo inesperado (esperado JSON do servidor)'
              : 'Resposta inesperada do servidor (esperado JSON)');
          } else if (xhr.status === 401) {
            fail('Servidor respondeu HTTP 401 — confira usuario e senha');
          } else if (entry.kind === 'proxy') {
            fail('Proxy proprio respondeu HTTP ' + xhr.status + ' — confira a URL do proxy e o servidor');
          } else {
            fail('Servidor respondeu HTTP ' + xhr.status);
          }
        } else {
          /* proxy publico devolveu HTML/erro/lixo -> tenta os outros */
          if (done) return;
          reasons.push(entry.label + ':' + (okStatus ? 'nao-json' : ('HTTP ' + xhr.status)));
          pending--;
          if (pending <= 0) buildFail();
        }
      };
      xhr.onerror = function () {
        if (done) return;
        reasons.push(entry.label);
        pending--;
        if (pending <= 0) buildFail();
      };
      xhr.ontimeout = function () {
        if (done) return;
        reasons.push(entry.label + ':tempo');
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
        reasons.push(entry.label);
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
      if (seen.length) msg += ' (tentativas: ' + seen.join(' / ') + ')';
      if (proxyOn) {
        msg += '. Falhou direto, HTTPS e via proxy. Confira o endereco do servidor ou informe um proxy proprio (ex.: Cloudflare Worker) no campo do login.';
      } else {
        msg += '. Se o painel e HTTP ou bloqueia o navegador, marque "usar proxy CORS" no login.';
      }
      fail(msg);
    }

    for (var idx = 0; idx < list.length; idx++) {
      tryNext(list[idx]);
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
