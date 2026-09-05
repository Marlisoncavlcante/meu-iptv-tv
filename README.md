# Meu IPTV TV — Site oficial + downloads

Landing page de divulgação do aplicativo **Meu IPTV TV** (player IPTV Xtream),
publicada no **GitHub Pages**: https://marlisoncavlcante.github.io/meu-iptv-tv/

- **Download para Windows (ZIP, ~0,5 MB):** `assets/download/MeuIPTV-TV-Windows-v1.0.1.zip`
- **Download Android (APK):** `assets/download/MeuIPTV-TV-v1.0.1.apk`
- **Política de privacidade:** `privacidade.html`

> ℹ️ **Nota:** a antiga **"Versão Web"** (reprodução direto no navegador) foi
> **descontinuada** — navegadores bloqueiam provedores IPTV HTTP sem CORS.
> Para computador, o caminho agora é a **versão Windows** (app nativo, acesso
> direto ao provedor, igual à TV).

---

## Estrutura

| Arquivo/Pasta | Descrição |
|---|---|
| `index.html` | Landing page (PT-BR): recursos, telas, como instalar, download Windows/APK, FAQ |
| `assets/css/style.css` | Estilos da página |
| `assets/js/main.js` | Interações da página (menu, lightbox, ano) |
| `assets/download/MeuIPTV-TV-Windows-v1.0.1.zip` | App Windows (WebView2, portátil) |
| `assets/download/MeuIPTV-TV-v1.0.1.apk` | App Android (TV Box / celular) |
| `privacidade.html` | Política de privacidade |
| `assets/img/` | Ícones e capturas de tela |

## Como publicar

1. Altere o que precisar em `index.html`.
2. Commit e push:

```powershell
git add -A
git commit -m "Site oficial Meu IPTV TV v1.0.1 (Windows + Android)"
git push
```

O GitHub Pages publica automaticamente (branch `main`).

> Downloads e assets funcionam com caminhos relativos do Pages.
> Para atualizar o ZIP do Windows: reconstrua o app (pasta `windows/` na raiz do
> projeto) e substitua o arquivo em `assets/download/`.

## Versões dos apps

| Plataforma | Package | Versão | Arquivo |
|---|---|---|---|
| Windows (10/11 x64) | app local (WebView2) | 1.0.1 | `MeuIPTV-TV-Windows-v1.0.1.zip` |
| Android | `com.meuiptv.tv` | 1.0.1 | `MeuIPTV-TV-v1.0.1.apk` |
| LG webOS | `com.meuiptv.tv` | 1.0.0 | fora deste site (loja LG / Developer Mode) |
