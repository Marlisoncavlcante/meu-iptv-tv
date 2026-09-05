/* ============================================================
   web.js — Adaptação para NAVEGADOR (versão web do site)
   1) Encaixa o canvas 1920x1080 em qualquer janela (stage escalado)
   2) Checkbox de proxy CORS na tela de login (persistente)
   3) Botão de tela cheia (⛶) + mouse → foco + tecla F = favoritar
   ============================================================ */
(function () {
  "use strict";

  window.IS_WEB = true;

  /* ---------- 1) STAGE 1920x1080 escalado ---------- */
  var DESIGN_W = 1920, DESIGN_H = 1080;
  var stage = null;

  function buildStage() {
    if (stage) return;
    stage = document.createElement('div');
    stage.id = 'web-stage';
    while (document.body.firstChild) {
      stage.appendChild(document.body.firstChild);
    }
    document.body.appendChild(stage);
    stage.style.position = 'absolute';
    stage.style.width = DESIGN_W + 'px';
    stage.style.height = DESIGN_H + 'px';
    stage.style.transformOrigin = '0 0';
    stage.style.overflow = 'hidden';

    /* barra de status web (só na tela de login) */
    var tag = document.createElement('div');
    tag.id = 'webTag';
    tag.textContent = '▶ VERSÃO WEB';
    stage.appendChild(tag);

    /* botão tela cheia */
    var fs = document.createElement('button');
    fs.id = 'webFs';
    fs.type = 'button';
    fs.title = 'Tela cheia (F11)';
    fs.innerHTML = '&#x26F6;';
    fs.addEventListener('click', function () {
      var el = document.documentElement;
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) { el.requestFullscreen().catch(function () {}); }
        else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
      } else if (document.exitFullscreen) { document.exitFullscreen().catch(function () {}); }
    });
    stage.appendChild(fs);

    /* some com a tag/bolinha quando não estiver na tela de login */
    var sl = document.getElementById('screenLogin');
    if (sl) {
      new MutationObserver(function () {
        tag.style.display = sl.classList.contains('active') ? '' : 'none';
      }).observe(sl, { attributes: true, attributeFilter: ['class'] });
      tag.style.display = sl.classList.contains('active') ? '' : 'none';
    }
    /* some com o botão de tela cheia enquanto o player está aberto */
    var sp = document.getElementById('screenPlayer');
    if (sp) {
      new MutationObserver(function () {
        fs.classList.toggle('hidden-fs', sp.classList.contains('active'));
      }).observe(sp, { attributes: true, attributeFilter: ['class'] });
    }
  }

  function fit() {
    if (!stage) return;
    var w = window.innerWidth || DESIGN_W;
    var h = window.innerHeight || DESIGN_H;
    var s = Math.min(w / DESIGN_W, h / DESIGN_H);
    if (s <= 0) s = 1;
    stage.style.transform = 'scale(' + s + ')';
    stage.style.left = Math.round((w - DESIGN_W * s) / 2) + 'px';
    stage.style.top = Math.round((h - DESIGN_H * s) / 2) + 'px';
  }

  /* ---------- 2) Proxy CORS (tela de login) ---------- */
  function proxyPrefix() {
    return 'https://corsproxy.io/?url=';
  }
  function setProxy(on, silent) {
    window.WEB_PROXY_ENABLED = !!on;
    window.webProxyPrefix = on ? proxyPrefix() : '';
    try { localStorage.setItem('webProxy', on ? '1' : '0'); } catch (e) {}
    var st = document.getElementById('proxyState');
    if (st) {
      st.textContent = on ? 'proxy ATIVO — seus dados passam por um serviço externo de CORS' : '';
      st.style.color = on ? '#ffb800' : '';
    }
    if (!silent) {
      var ts = document.getElementById('toast');
      var status = document.getElementById('loginStatus');
      if (status) {
        status.textContent = on
          ? 'Proxy ativado. As chamadas da API usarão um proxy público de CORS. (para desativar, desmarque)'
          : '';
      }
    }
  }
  function initProxy() {
    var cb = document.getElementById('inProxy');
    if (!cb) return;
    var saved = '0';
    try { saved = localStorage.getItem('webProxy') || '0'; } catch (e) {}
    cb.checked = saved === '1';
    setProxy(cb.checked, true);
    cb.addEventListener('change', function () {
      setProxy(cb.checked, false);
    });
  }

  /* ---------- 3) Mouse/touch: foco + Enter virtual ---------- */
  function closestFocusable(node) {
    while (node && node !== document) {
      if (node.classList && node.classList.contains('focusable')) return node;
      node = node.parentNode;
    }
    return null;
  }

  function onDocClick(e) {
    var el = closestFocusable(e.target);
    if (!el) return;
    /* atualiza o anel de foco (navegação por teclado continua do item clicado) */
    try {
      if (window.MainController && MainController.setFocus) {
        var cls = el.className;
        /* itens da grade podem exigir rolagem até ficar visível */
        MainController.setFocus(el);
      }
    } catch (err) { /* não crítico */ }
  }

  /* tecla F favorita (como o botão azul/amarelo do controle) */
  function onKey(e) {
    if (e.keyCode === 70 || e.key === 'f' || e.key === 'F') {
      var t = e.target;
      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (!typing && window.MainController && MainController.handleKey) {
        MainController.handleKey(406);
        e.preventDefault();
      }
    }
  }

  /* ---------- boot ---------- */
  function boot() {
    document.documentElement.style.background = '#05070d';
    document.body.style.background = '#05070d';
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    buildStage();
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', function () { setTimeout(fit, 250); });
    if (window.visualViewport) {
      try {
        window.visualViewport.addEventListener('resize', fit);
      } catch (e) {}
    }
    initProxy();
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { setTimeout(fit, 120); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
