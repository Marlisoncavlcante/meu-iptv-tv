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

Este `worker-cors.js` já vem **pré-configurado para o seu painel**:

```js
const ALLOWED_PREFIXES = ['http://auth.urlsync.gy', 'https://auth.urlsync.gy'];
```

Ou seja: o worker só aceita buscar URLs do `auth.urlsync.gy` — ninguém mais
consegue usá-lo como proxy aberto. Para liberar outro painel no futuro, basta
adicionar o endereço na lista (ou esvaziá-la, o que libera qualquer destino —
não recomendado).

- `ALLOWED_ORIGINS = '*'` → libera qualquer site de origem. Para restringir,
  troque por `'https://marlisoncavlcante.github.io'`.

## Testar o worker

Com a URL do worker em mãos, teste num navegador ou no PowerShell:

```powershell
# troque pela sua URL de worker (o final ?url= aponta para o painel)
Invoke-WebRequest "https://meu-iptv-proxy.seu-subdominio.workers.dev/?url=http%3A%2F%2Fauth.urlsync.gy%2Fplayer_api.php" -UseBasicParsing | Select-Object StatusCode
```

Se responder `200`, o worker está no ar. Na tela de login do app web, use:

- **Servidor (DNS):** `http://auth.urlsync.gy`
- **Proxy próprio:** `https://meu-iptv-proxy.seu-subdominio.workers.dev/?url=`
- **Usuário/senha:** os que funcionam na TV LG

> Testei o painel: HTTP responde e a API Xtream (`player_api.php`) responde
> `401` para senha errada — ou seja, está no ar. Ele **não** tem HTTPS, então
> na web ele só conecta passando pelo worker (ou por um painel com HTTPS).
> Dica: se der erro, aperte **Ctrl+F5** (recarrega o JavaScript novo) e tente de novo.
