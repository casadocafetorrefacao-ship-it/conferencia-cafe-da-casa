const APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbyYE3vU6wwy30egzUfvEQRhjkfTxZ-3Xg0NJUCLkvAqh98pHgPbzu-45my5pFlOpS52xA/exec';
const ALLOWED_ORIGINS = new Set([
  'https://casadocafetorrefacao-ship-it.github.io',
]);

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://casadocafetorrefacao-ship-it.github.io';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Vary': 'Origin',
  };
}

function cleanParams(url) {
  const allowed = new Set([
    'acao','chave','pedidoId','itemId','codigoLido','usuario','confirmacaoVisual','observacao'
  ]);
  const out = new URLSearchParams();
  for (const [k, v] of url.searchParams.entries()) {
    if (allowed.has(k)) out.set(k, v);
  }
  return out;
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      let upstream;
      if (request.method === 'GET') {
        const incoming = new URL(request.url);
        const qs = cleanParams(incoming).toString();
        upstream = await fetch(APPS_SCRIPT + (qs ? '?' + qs : ''), {
          method: 'GET',
          redirect: 'follow',
          headers: { 'User-Agent': 'CafeDaCasa-Conferencia-Worker/1.0' },
        });
      } else if (request.method === 'POST') {
        const body = await request.text();
        upstream = await fetch(APPS_SCRIPT, {
          method: 'POST',
          redirect: 'follow',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'CafeDaCasa-Conferencia-Worker/1.0',
          },
          body,
        });
      } else {
        return new Response(JSON.stringify({ ok:false, erro:'METODO_NAO_PERMITIDO' }), {
          status: 405,
          headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
        });
      }

      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { ...cors, 'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8' },
      });
    } catch (err) {
      return new Response(JSON.stringify({
        ok:false,
        erro:'PROXY_INDISPONIVEL',
        detalhe:String(err && err.message || err),
      }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  }
};
