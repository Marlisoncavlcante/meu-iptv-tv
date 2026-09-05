# 🔧 Como criar seu próprio Proxy CORS (Cloudflare Worker — grátis)

**Por que precisa:** o site **MeuIPTV TV** roda em HTTPS (GitHub Pages).
Painéis Xtream normalmente são **HTTP** e **não enviam cabeçalhos CORS**.
O navegador então bloqueia a conexão ("Erro de rede ao conectar"), mesmo
com o painel no ar — que é exatamente o caso da TV LG, que **não** tem essa
restrição e por isso funciona direto.

Proxies públicos (corsproxy.io, allorigins, codetabs) **vivem caindo ou
pedem chave paga** — não dá para depender deles. A solução definitiva é um
**Worker do Cloudflare seu**, gratuito (100 mil requisições/dia), que faz o
papel de "ponte": o navegador chama o Worker (HTTPS) e o Worker baixa a
resposta do painel e devolve com cabeçalhos CORS.

---

## Passo a passo (5 minutos)

1. Crie uma conta gratuita em **https://dash.cloudflare.com** (se ainda não tiver).
2. No menu lateral: **Workers & Pages → Create → Worker**.
3. Dê um nome, ex.: `meu-iptv-proxy` → **Deploy**.
4. Clique em **Edit code** (no worker criado).
5. Apague o conteúdo padrão e **cole o arquivo `worker-cors.js`** deste repositório
   (é só abrir [worker-cors.js](worker-cors.js) e copiar tudo).
6. Clique em **Deploy** (botão no topo do editor).
7. Copie a URL do worker, que aparece no topo, ex.:
   `https://meu-iptv-proxy.seu-subdominio.workers.dev`
8. No **app web** (https://marlisoncavlcante.github.io/meu-iptv-tv/), tela de login:
   - deixe marcada a opção **"usar proxy CORS"**;
   - no campo **"Proxy próprio"** cole:
     `https://meu-iptv-proxy.seu-subdominio.workers.dev/?url=`
   - preencha DNS/usuário/senha e clique em Entrar.

Pronto — o login passa a usar **só o seu worker**, sem depender de proxy público.

---

## Segurança / ajustes (opcional)

No topo do `worker-cors.js` existem duas constantes:

- `ALLOWED_ORIGINS = '*'` → libera qualquer site. Para restringir ao seu site,
  troque por `'https://marlisoncavlcante.github.io'`.
- `ALLOWED_PREFIXES = []` → deixe vazio para permitir qualquer painel, ou
  preencha com o endereço do **seu** painel para que o worker só aceite ele:

```js
const ALLOWED_PREFIXES = ['http://SEU-PAINEL-IPTV.COM'];
```

---

## Testar o worker

Com a URL do worker em mãos, teste num navegador ou no PowerShell:

```powershell
# troque pela sua URL de worker
Invoke-WebRequest "https://meu-iptv-proxy.seu-subdominio.workers.dev/?url=http%3A%2F%2Fexemplo.com" -UseBasicParsing | Select-Object StatusCode
```

Se responder `200`, o worker está no ar e pronto para ser usado no login.

> Dica: se mesmo com o worker der "Erro de rede", aperte **Ctrl+F5** na página
> do app (recarrega o JavaScript novo, sem cache) e tente de novo.
