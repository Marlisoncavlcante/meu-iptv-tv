/* ============================================================
   playerService.js — player HTML5 (HLS nativo webOS)
   - Ao iniciar a reprodução a tela fica "máxima": as legendas
     da UI (topo e rodapé) somem após 3 s.
   - Ao terminar (VOD/série) sai do player automaticamente após 3 s.
   - Closed captions/text tracks são desabilitados.
   ============================================================ */
var PlayerService = (function () {
  var video = null;
  var titleEl = null;
  var liveBadge = null;
  var spinnerEl = null;
  var errorEl = null;
  var topEl = null;
  var bottomEl = null;
  var screen = null;
  var currentUrl = '';
  var currentTitle = '';
  var playing = false;
  var liveMode = false;
  var errTimer = null;
  var uiTimer = null;
  var endTimer = null;
  var endedHandler = null;
  var hls = null;
  var hlsNetErrors = 0;
  var watchdog = null;
  var endedFlag = false;

  /* HLS nativo: só confia em "probably" (Safari/iOS). Chromium/Edge
     responde "maybe" mas NÃO toca m3u8 de verdade — por isso o hls.js
     tem prioridade sempre que disponível. */
  function supportsNativeHls() {
    try {
      var v = document.createElement('video');
      var t = v.canPlayType('application/vnd.apple.mpegurl');
      return t === 'probably';
    } catch (e) { return false; }
  }
  function destroyHls() {
    if (hls) {
      try { hls.destroy(); } catch (e) {}
      hls = null;
    }
    hlsNetErrors = 0;
  }

  /* Se em ~12 s o vídeo não começar (nem der erro), mostra o erro em vez
     de deixar a tela presa com a interface sobreposta para sempre. */
  function clearWatchdog() {
    if (watchdog) { clearTimeout(watchdog); watchdog = null; }
  }
  function armWatchdog() {
    clearWatchdog();
    watchdog = setTimeout(function () {
      watchdog = null;
      if (!playing && !endedFlag) onVideoError();
    }, 10000);
  }

  function init() {
    screen = document.getElementById('screenPlayer');
    video = document.getElementById('videoEl');
    titleEl = document.getElementById('puTitle');
    liveBadge = document.getElementById('puLiveBadge');
    spinnerEl = document.getElementById('puSpinner');
    errorEl = document.getElementById('puError');
    topEl = document.querySelector('.pu-top');
    bottomEl = document.querySelector('.pu-bottom');

    disableCaptions();

    /* WEB: mouse parado/click mostra a UI do player (depois some sozinha) */
    video.addEventListener('click', function () { pokeOverlay(6000); });
    video.addEventListener('mousemove', function () { pokeOverlay(4000); });

    video.addEventListener('playing', function () {
      clearWatchdog();
      hideSpinner();
      playing = true;
      pokeOverlay(); /* mostra a UI e agenda o sumiço em 3 s */
    });
    video.addEventListener('waiting', function () { if (playing === false) return; showSpinner(); });
    video.addEventListener('canplay', function () { hideSpinner(); });
    video.addEventListener('error', function () { onVideoError(); });
    video.addEventListener('stalled', function () { showSpinner(); });
    video.addEventListener('ended', function () { onVideoEnded(); });

    /* retry automático 1x em falha de rede */
    video.addEventListener('timeout', function () { onVideoError(); });
    video.addEventListener('abort', function () { hideSpinner(); });
  }

  /* desliga legendas/closed-caption embutidas do vídeo */
  function disableCaptions() {
    try {
      var tt = video.textTracks;
      if (tt) {
        for (var i = 0; i < tt.length; i++) {
          try { tt[i].mode = 'disabled'; } catch (e) {}
        }
      }
    } catch (e) {}
  }

  function showScreen() { screen.classList.add('active'); }
  function hideScreen() { screen.classList.remove('active'); }

  function showSpinner() { if (spinnerEl) spinnerEl.classList.remove('hidden'); if (errorEl) errorEl.classList.add('hidden'); }
  function hideSpinner() { if (spinnerEl) spinnerEl.classList.add('hidden'); }
  function showError() { hideSpinner(); if (errorEl) errorEl.classList.remove('hidden'); }

  /* ---------- UI do player (legendas topo/rodapé) ---------- */
  function setOverlay(show) {
    if (!topEl || !bottomEl) return;
    if (show) { topEl.classList.remove('hidden'); bottomEl.classList.remove('hidden'); }
    else { topEl.classList.add('hidden'); bottomEl.classList.add('hidden'); }
  }
  /* mostra a UI e agenda o auto-hide depois de 'ms' (padrão 3 s) */
  function pokeOverlay(ms) {
    var delay = (typeof ms === 'number') ? ms : 3000;
    setOverlay(true);
    if (uiTimer) { clearTimeout(uiTimer); uiTimer = null; }
    uiTimer = setTimeout(function () {
      uiTimer = null;
      if (playing && !video.paused && !video.ended) setOverlay(false);
    }, delay);
  }
  function forceHideOverlay() { setOverlay(false); }

  function onVideoEnded() {
    clearWatchdog();
    hideSpinner();
    disableCaptions();
    if (liveMode) { setOverlay(true); return; } /* canal ao vivo: não "termina" */
    endedFlag = true;
    setOverlay(true);
    if (endTimer) { clearTimeout(endTimer); endTimer = null; }
    endTimer = setTimeout(function () {
      endTimer = null;
      if (endedHandler) endedHandler(); /* MainController sai do player */
    }, 3000);
  }

  function onVideoError() {
    clearWatchdog();
    hideSpinner();
    if (errorEl) {
      if (window.IS_WEB) {
        var sub = errorEl.querySelector('.pu-err-sub');
        if (sub) {
          sub.textContent = 'Tente de novo. Se persistir, o provedor pode bloquear o navegador (CORS) — marque "proxy CORS" no login ou use o app Android/TV.';
        }
      }
      errorEl.classList.remove('hidden');
    }
  }

  function setBadge(live) {
    if (!liveBadge) return;
    if (live) liveBadge.classList.remove('hidden');
    else liveBadge.classList.add('hidden');
  }

  function play(url, title, opts) {
    opts = opts || {};

    /* Remove o anel de foco de qualquer tile das telas de conteúdo.
       O tile clicado/acionado fica com a classe .focused (que tem
       z-index alto); sem esta limpeza ele continua desenhado POR CIMA
       do vídeo, na mesma posição em que foi clicado, durante toda a
       reprodução ("miniatura do título presa na tela"). */
    var focused = document.querySelectorAll('.focused');
    for (var fi = 0; fi < focused.length; fi++) {
      focused[fi].classList.remove('focused');
    }

    stop();
    currentUrl = url;
    currentTitle = title || '';
    liveMode = !!opts.live;
    endedFlag = false;
    if (titleEl) titleEl.textContent = currentTitle;
    setBadge(liveMode);
    showScreen();
    setOverlay(true);
    showSpinner();
    playing = false;

    var isHls = /\.m3u8(\?|#|$)/i.test(url);
    if (isHls && window.Hls && Hls.isSupported()) {
      startHls(url);
    } else if (isHls && supportsNativeHls()) {
      startNative();
    } else if (isHls) {
      /* nem hls.js nem HLS nativo: última tentativa pelo elemento de vídeo */
      startNative();
    } else {
      startNative();
    }
    armWatchdog();
  }

  /* ---------- playback nativo (mp4/mkv/ts/HLS no Safari) ---------- */
  function startNative() {
    /* retry com o mesmo URL após erro de load (1 tentativa) */
    var attempts = 0;
    var doRetry = function () { return; }; /* definido abaixo */
    doRetry = function () {
      attempts++;
      if (attempts > 2) { showError(); return; }
      video.removeEventListener('error', onVideoError);
      video.addEventListener('error', function h() {
        video.removeEventListener('error', h);
        hideSpinner();
        if (attempts <= 1) { setTimeout(function () { doRetry(); }, 600); }
        else { showError(); }
      });
      try { video.src = currentUrl; video.load(); } catch (e) { onVideoError(); }
      disableCaptions();
      var p = video.play();
      if (p && typeof p.catch === 'function') { p.catch(function () { /* autoplay ok */ }); }
    };
    doRetry();
  }

  /* ---------- HLS via hls.js (Chrome/Edge/Firefox/Android TV web) ---------- */
  function startHls(url) {
    destroyHls();
    var h = new Hls({ enableWorker: true, maxBufferLength: 30 });
    hls = h;
    h.on(Hls.Events.ERROR, function (evt, data) {
      if (!data || !data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hlsNetErrors++;
        if (hlsNetErrors <= 2) { try { h.startLoad(); } catch (e) {} return; }
        /* se o hls.js falhar (ex.: CORS), tenta o reprodutor nativo uma vez */
        if (supportsNativeHls()) {
          destroyHls();
          startNative();
          return;
        }
        destroyHls();
        onVideoError();
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        try { h.recoverMediaError(); } catch (e) { destroyHls(); onVideoError(); }
      } else {
        destroyHls();
        onVideoError();
      }
    });
    h.on(Hls.Events.MANIFEST_PARSED, function () {
      hideSpinner();
      var p = video.play();
      if (p && typeof p.catch === 'function') { p.catch(function () {}); }
    });
    h.on(Hls.Events.LEVEL_SWITCHED, function () { /* ok */ });
    try {
      /* ordem recomendada pelo hls.js: anexar a mídia antes de carregar */
      h.attachMedia(video);
      h.loadSource(url);
    } catch (e) { destroyHls(); onVideoError(); }
  }

  function stop() {
    destroyHls();
    clearWatchdog();
    endedFlag = false;
    if (!video) return;
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {}
    hideSpinner();
    if (errorEl) errorEl.classList.add('hidden');
    playing = false;
    liveMode = false;
    currentUrl = '';
    if (errTimer) { clearTimeout(errTimer); errTimer = null; }
    if (uiTimer) { clearTimeout(uiTimer); uiTimer = null; }
    if (endTimer) { clearTimeout(endTimer); endTimer = null; }
    setOverlay(true);
  }

  function close() {
    stop();
    hideScreen();
  }

  function isPlaying() { return playing; }
  function getCurrentUrl() { return currentUrl; }
  function isLive() { return liveMode; }
  function setEndedHandler(fn) { endedHandler = fn; }

  return {
    init: init,
    play: play,
    stop: stop,
    close: close,
    isPlaying: isPlaying,
    getCurrentUrl: getCurrentUrl,
    isLive: isLive,
    setEndedHandler: setEndedHandler,
    pokeOverlay: pokeOverlay,
    forceHideOverlay: forceHideOverlay
  };
})();
