# 🌐 Meu IPTV TV — Site oficial

Site de divulgação do aplicativo **Meu IPTV TV** (player IPTV Xtream para Android TV, TV Box, Google TV e celular), pronto para publicar no **GitHub Pages** — **inclui uma Versão Web do app** que roda no navegador.

🌍 **No ar (GitHub Pages):**
- Landing page: <https://marlisoncavlcante.github.io/meu-iptv-tv/>
- **Versão Web do app:** <https://marlisoncavlcante.github.io/meu-iptv-tv/app/>
- Repositório: <https://github.com/Marlisoncavlcante/meu-iptv-tv>

![banner](assets/img/banner.png)

## 📄 Conteúdo

| Arquivo | Descrição |
|---|---|
| `index.html` | Landing page (PT-BR): recursos, telas, como instalar, download APK, **versão web**, FAQ |
| `privacidade.html` | Política de privacidade (não coleta dados) |
| `app/` | **Versão Web do app** (cópia do player com adaptações de navegador) |
| `app/index.html` | Entrada da versão web — link direto: `…/app/` |
| `assets/css/style.css` | Estilos do site |
| `assets/js/app.js` | Lightbox + rodapé |
| `assets/img/icon.png` | Ícone do app (512×512) |
| `assets/img/banner.png` | Feature graphic 1024×500 |
| `assets/img/shots/*.png` | 7 capturas de tela (1920×1080) |
| `assets/download/MeuIPTV-TV-v1.0.1.apk` | APK de download (**0,23 MB** — ok para GitHub) |

## ▶️ Versão Web (`app/`)

O app completo rodando no navegador (Chrome/Edge/Firefox/Safari), com:

- Canvas 1920×1080 **escalado automaticamente** para qualquer janela (`js/web.js`);
- Navegação por **teclado** (setas/Enter/Backspace/Esc), **mouse e toque**;
- **hls.js** local (`vendor/hls.min.js`) para canais .m3u8 no Chrome/Edge/Firefox
  (Safari usa HLS nativo);
- **Proxy CORS opcional** na tela de login (para provedores que bloqueiam o navegador);
- Botão de tela cheia (⛶) + tecla **F** para favoritar;
- Imagens carregadas por URL direta (como no Android — sem base64/CORS).

> Observação: provedores IPTV que não enviam cabeçalhos CORS podem exigir a opção
> "proxy CORS" (ou bloquear a reprodução no navegador — nesse caso use o APK na TV).

## 🚀 Como publicar no GitHub Pages

### Opção A — repositório próprio do site (recomendado)

```bash
# 1. Crie um repositório no GitHub, ex.: "meuiptv"
# 2. Na pasta do site:
cd site
git init
git add .
git commit -m "Site oficial Meu IPTV TV v1.0.1 (com versão web)"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/meuiptv.git
git push -u origin main
```

Depois, no GitHub:
1. Abra o repositório → **Settings** → **Pages**.
2. Em **Build and deployment**, escolha a branch `main` e pasta `/ (root)`.
3. Salve. O site fica em `https://SEU_USUARIO.github.io/meuiptv/`.

> O download do APK e a versão web funcionam direto do Pages (caminhos relativos,
> sem back-end). O APK tem 0,23 MB, bem abaixo do limite de 100 MB do GitHub.

### Opção B — já tem outro repositório (ex.: onde guarda o código do app)

Coloque **o conteúdo da pasta `site`** na raiz (ou em `docs/`) e ative o Pages apontando para
`main` → `/docs` (Settings → Pages → Source: Deploy from a branch → `/docs`).

## ✏️ Antes de publicar — personalize

1. **Rodapé / página de privacidade**: o contato usa *issues* do repositório. Se quiser e-mail,
   edite `index.html` (seção de contato da FAQ) e `privacidade.html` (§7 Contato).
2. **(Opcional) Domínio próprio**: Settings → Pages → Custom domain.

## 🧪 Testar localmente

Abra o `index.html` direto no navegador (funciona offline) ou rode um servidor simples:

```bash
# com Python
python -m http.server 8080
# com Node
npx serve .
```

Depois acesse `http://localhost:8080`.

## 📸 Capturas usadas

Geradas a partir das telas reais do app (login, menu, canais, filmes, séries, favoritos e player),
em resolução 1920×1080. Clique nas imagens do site para ampliar.

---

© 2026 Meu IPTV TV · Player de mídia para provedores IPTV (Xtream Codes).
