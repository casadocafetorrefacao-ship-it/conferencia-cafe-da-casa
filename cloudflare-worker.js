const APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbyYE3vU6wwy30egzUfvEQRhjkfTxZ-3Xg0NJUCLkvAqh98pHgPbzu-45my5pFlOpS52xA/exec';

const ALLOWED_ORIGINS = new Set([
  'https://casadocafetorrefacao-ship-it.github.io',
]);

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin)
    ? origin
    : 'https://casadocafetorrefacao-ship-it.github.io';

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
  for (const [key, value] of url.searchParams.entries()) {
    if (allowed.has(key)) out.set(key, value);
  }
  return out;
}

function jsonResponse(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
  });
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
        const query = cleanParams(incoming).toString();

        upstream = await fetch(APPS_SCRIPT + (query ? '?' + query : ''), {
          method: 'GET',
          redirect: 'follow',
          headers: { 'User-Agent': 'CafeDaCasa-Conferencia-Worker/2.1' }
        });
      } else if (request.method === 'POST') {
        const raw = await request.text();
        let body;
        try {
          const parsed = JSON.parse(raw || '{}');
          const permitted = ['acao','chave','pedidoId','itemId','codigoLido','usuario','confirmacaoVisual','observacao'];
          body = JSON.stringify(Object.fromEntries(
            permitted
              .filter(k => Object.prototype.hasOwnProperty.call(parsed, k))
              .map(k => [k, parsed[k]])
          ));
        } catch {
          return jsonResponse({ ok:false, erro:'JSON_INVALIDO' }, 400, cors);
        }

        upstream = await fetch(APPS_SCRIPT, {
          method: 'POST',
          redirect: 'follow',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'CafeDaCasa-Conferencia-Worker/2.1'
          },
          body
        });
      } else {
        return jsonResponse({ ok:false, erro:'METODO_NAO_PERMITIDO' }, 405, cors);
      }

      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: {
          ...cors,
          'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8'
        }
      });
    } catch (err) {
      return jsonResponse({
        ok:false,
        erro:'PROXY_INDISPONIVEL',
        detalhe:String(err && err.message ? err.message : err)
      }, 502, cors);
    }
  }
};
