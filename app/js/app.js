/* ============================================================
   app.js — inicialização e teclas do controle remoto
   ============================================================ */
(function () {
  /* VERSÃO WEB (site): navegador pinta imagens remotas direto (como no
     Android) — sem base64/CORS. A entrada é teclado físico + mouse/touch
     (bindClicks no MainController). web.js cuida do encaixe da tela. */
  window.IS_ANDROID = true;

  function boot() {
    PlayerService.init();
    MainController.init();

    window.appKey = function (kc) {
      MainController.handleKey(kc);
    };

    window.addEventListener('keydown', function (ev) {
      var kc = ev.keyCode || ev.which;
      MainController.handleKey(kc);
      /* impede rolagem/navegação padrão das setas */
      if ([37, 38, 39, 40, 13, 33, 34, 461, 27].indexOf(kc) !== -1) {
        ev.preventDefault();
      }
      var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
      if (kc === 8 && !typing) { ev.preventDefault(); }
    }, true);

    MainController.setFocus(document.getElementById('btnLogin'));
    MainController.tryAutoLogin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
