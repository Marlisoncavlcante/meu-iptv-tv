// ============================================================
//  MeuIPTV TV — Proxy CORS para DENO DEPLOY (alternativa ao Cloudflare)
// ============================================================
//  1) Acesse https://dash.deno.com e entre com "Sign in with GitHub"
//     (use a mesma conta do GitHub do site — Marlisoncavlcante).
//  2) Clique em "New Playground" (ou "New Project").
//  3) Apague o codigo padrão e cole este arquivo inteiro.
//  4) Dê um nome (ex.: meu-iptv-proxy) e salve/deploy.
//  5) Use a URL https://meu-iptv-proxy.deno.dev no campo "Proxy próprio":
//     https://meu-iptv-proxy.deno.dev/?url=
// ============================================================

// Painel permitido (deixe vazio [] para aceitar qualquer destino):
const ALLOWED_PREFIXES = ["http://auth.urlsync.gy", "https://auth.urlsync.gy"];

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const target = url.searchParams.get("url") || "";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "GET") return json({ error: "Somente GET" }, 405, req);
  if (!target) return json({ error: "Parâmetro ?url= ausente" }, 400, req);

  let dest;
  try { dest = new URL(target); } catch (_) { return json({ error: "URL inválida" }, 400, req); }
  if (dest.protocol !== "http:" && dest.protocol !== "https:") {
    return json({ error: "Protocolo não suportado" }, 400, req);
  }
  const lower = target.toLowerCase();
  if (ALLOWED_PREFIXES.length && !ALLOWED_PREFIXES.some((p) => lower.indexOf(p.toLowerCase()) === 0)) {
    return json({ error: "Destino não permitido" }, 403, req);
  }

  try {
    const resp = await fetch(dest, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (MeuIPTV-WebProxy)" },
      redirect: "follow",
    });
    const headers = new Headers(resp.headers);
    headers.delete("content-security-policy");
    headers.delete("content-security-policy-report-only");
    headers.set("Access-Control-Allow-Origin", corsOrigin(req));
    return new Response(resp.body, { status: resp.status, headers });
  } catch (err) {
    return json({ error: "Falha ao acessar o destino", detail: String(err) }, 502, req);
  }
});

function corsOrigin(req) {
  const origin = req.headers.get("Origin") || "";
  return origin || "*";
}

function corsHeaders(req) {
  return {
    "Access-Control-Allow-Origin": corsOrigin(req),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj, status, req) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ "content-type": "application/json" }, corsHeaders(req)),
  });
}
