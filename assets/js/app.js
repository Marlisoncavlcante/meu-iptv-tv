/* Meu IPTV TV — site JS (lightbox + detalhes do ano) */
(function () {
  "use strict";

  // Lightbox para as capturas de tela
  var shots = document.querySelectorAll(".shot");
  var lb = document.getElementById("lightbox");
  var lbImg = lb ? lb.querySelector("img") : null;
  var lbCap = lb ? lb.querySelector(".lb-cap") : null;

  function openLb(src, cap) {
    if (!lb) return;
    lbImg.src = src;
    lbCap.textContent = cap || "";
    lb.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeLb() {
    if (!lb) return;
    lb.classList.remove("open");
    lbImg.src = "";
    document.body.style.overflow = "";
  }

  shots.forEach(function (s) {
    s.addEventListener("click", function () {
      var img = s.querySelector("img");
      var cap = (s.querySelector("figcaption") || {}).textContent || "";
      if (img) openLb(img.src, cap.trim());
    });
  });

  var closeBtn = lb ? lb.querySelector(".lb-close") : null;
  if (closeBtn) closeBtn.addEventListener("click", closeLb);
  if (lb) {
    lb.addEventListener("click", function (e) { if (e.target === lb) closeLb(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLb();
    });
  }

  // Ano no rodapé
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();
