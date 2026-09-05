// ============================================================
//  MeuIPTV TV — Proxy CORS para Cloudflare Workers
// ============================================================
//  POR QUE: o site roda em HTTPS (GitHub Pages) e a maioria dos
//  painéis Xtream é HTTP e/ou não envia cabeçalhos CORS. Por isso
//  o navegador bloqueia o login. Este Worker resolve: ele baixa a
//  URL do painel e devolve com cabeçalhos CORS — e o navegador
//  conversa só com o HTTPS do Worker (sem mixed content).
//
//  COMO USAR:
//   1) https://dash.cloudflare.com  -> Workers & Pages -> Create
//      -> Worker -> dê um nome (ex.: meu-iptv-proxy) -> Deploy.
//   2) Clique em "Edit code", apague tudo e cole este arquivo.
//   3) Deploy novamente (botão "Deploy" no editor).
//   4) Copie a URL: https://meu-iptv-proxy.SEU-SUBDOMINIO.workers.dev/
//   5) No app web (tela de login), marque "usar proxy CORS" e cole
//      no campo "Proxy próprio":
//      https://meu-iptv-proxy.SEU-SUBDOMINIO.workers.dev/?url=
//      (o próprio app acrescenta o endereço do painel ao final)
// ============================================================

// Libera QUALQUER origem do navegador. Troque por "https://meu-iptv-tv.com"
// se quiser restringir a um site específico.
const ALLOWED_ORIGINS = '*';

// Restrinja os destinos permitidos (prefixo da URL). Vazio = permite tudo.
// Ja pre-configurado para o painel do usuario:
const ALLOWED_PREFIXES = ['http://auth.urlsync.gy', 'https://auth.urlsync.gy'];

// Hosts que nunca devem ser acessados pelo proxy (segurança interna).
const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get('url') || '';

    // Preflight de CORS (disparado pelo navegador antes do GET real)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== 'GET') {
      return json({ error: 'Somente GET' }, 405, request);
    }
    if (!target) {
      return json({ error: 'Parâmetro ?url= ausente' }, 400, request);
    }

    let dest;
    try {
      dest = new URL(target);
    } catch (e) {
      return json({ error: 'URL inválida' }, 400, request);
    }
    if (dest.protocol !== 'http:' && dest.protocol !== 'https:') {
      return json({ error: 'Protocolo não suportado' }, 400, request);
    }
    if (BLOCKED_HOSTS.indexOf(dest.hostname) >= 0) {
      return json({ error: 'Destino bloqueado' }, 403, request);
    }
    if (ALLOWED_PREFIXES.length) {
      const ok = ALLOWED_PREFIXES.some(function (p) {
        return target.toLowerCase().indexOf(p.toLowerCase()) === 0;
      });
      if (!ok) return json({ error: 'Destino não permitido' }, 403, request);
    }

    try {
      const resp = await fetch(dest.toString(), {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (MeuIPTV-WebProxy)' },
        redirect: 'follow',
      });
      const headers = new Headers(resp.headers);
      // Alguns painéis mandam CSP que o navegador aplicaria à página do site
      headers.delete('content-security-policy');
      headers.delete('content-security-policy-report-only');
      headers.set('Access-Control-Allow-Origin', corsOrigin(request));
      return new Response(resp.body, { status: resp.status, headers: headers });
    } catch (err) {
      return json({ error: 'Falha ao acessar o destino', detail: String(err) }, 502, request);
    }
  }
};

function corsOrigin(req) {
  const origin = req.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS === '*') return origin || '*';
  return ALLOWED_ORIGINS;
}

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': corsOrigin(req),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400'
  };
}

function json(obj, status, req) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ 'content-type': 'application/json' }, corsHeaders(req))
  });
}
