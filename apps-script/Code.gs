const OLIST = {
  AUTH_URL: 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth',
  TOKEN_URL: 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
  API_BASE: 'https://api.tiny.com.br/public-api/v3'
};

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};

    // Retorno do OAuth da Olist.
    if (p.code) return concluirOAuthOlist_(p.code);

    const acao = String(p.acao || 'ping').toLowerCase();

    if (acao === 'ping') {
      return jsonp_(e, {
        ok: true,
        servico: 'Conferencia Cafe da Casa',
        olistAutorizada: temTokenOlist_()
      });
    }

    if (acao === 'autorizar') return iniciarOAuthOlist_();
    if (acao === 'status_olist') return jsonp_(e, { ok: true, autorizada: temTokenOlist_() });
    if (acao === 'danfe') return jsonp_(e, buscarDanfeOlist_(p.chave || ''));

    return jsonp_(e, { ok: false, erro: 'ACAO_INVALIDA' });
  } catch (err) {
    return jsonp_(e, {
      ok: false,
      erro: 'ERRO_INTERNO',
      detalhe: String(err && err.message || err)
    });
  }
}

function iniciarOAuthOlist_() {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('OLIST_CLIENT_ID');
  if (!clientId) throw new Error('OLIST_CLIENT_ID_NAO_CONFIGURADO');

  const redirectUri = ScriptApp.getService().getUrl();
  if (!redirectUri) throw new Error('PUBLIQUE_O_SCRIPT_COMO_WEB_APP_PRIMEIRO');

  const url = OLIST.AUTH_URL + '?' + query_({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid',
    response_type: 'code'
  });

  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="font-family:Arial;padding:30px"><p>Redirecionando para a Olist...</p>' +
    '<script>location.replace(' + JSON.stringify(url) + ');</script></body></html>'
  );
}

function concluirOAuthOlist_(code) {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('OLIST_CLIENT_ID');
  const clientSecret = props.getProperty('OLIST_CLIENT_SECRET');
  const redirectUri = ScriptApp.getService().getUrl();

  if (!clientId || !clientSecret) throw new Error('CREDENCIAIS_OLIST_NAO_CONFIGURADAS');

  const resp = UrlFetchApp.fetch(OLIST.TOKEN_URL, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code: code
    },
    muteHttpExceptions: true
  });

  const status = resp.getResponseCode();
  const body = parseJson_(resp.getContentText());
  if (status < 200 || status >= 300 || !body.access_token) {
    throw new Error('FALHA_OAUTH_OLIST_' + status + '_' + JSON.stringify(body));
  }

  salvarTokensOlist_(body);

  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="font-family:Arial;background:#f3efe9;padding:30px">' +
    '<div style="max-width:600px;margin:40px auto;background:#fff;padding:24px;border-radius:16px">' +
    '<h2 style="color:#18794e">✅ Olist conectada com sucesso</h2>' +
    '<p>O sistema já pode consultar notas fiscais e produtos autorizados na sua conta.</p>' +
    '<p>Pode fechar esta página.</p></div></body></html>'
  );
}

function buscarDanfeOlist_(chave) {
  chave = somenteDigitos_(chave);
  if (chave.length !== 44) return { ok: false, erro: 'CHAVE_NFE_INVALIDA' };

  const numeroNfe = numeroNfeDaChave_(chave);

  // A API permite pesquisar notas pelo número. Depois confirmamos pela chave completa.
  const lista = olistGet_('/notas', {
    tipo: 'S',
    numero: numeroNfe,
    limit: 100,
    offset: 0
  });

  const candidatos = Array.isArray(lista.itens) ? lista.itens : [];
  const resumo = candidatos.find(n => somenteDigitos_(n.chaveAcesso) === chave);

  if (!resumo) {
    return {
      ok: false,
      erro: 'NOTA_NAO_ENCONTRADA_NA_OLIST',
      chave: chave,
      numeroNFe: numeroNfe
    };
  }

  const nota = olistGet_('/notas/' + encodeURIComponent(resumo.id));
  const itensOriginais = Array.isArray(nota.itens) ? nota.itens : [];

  const itens = itensOriginais.map(function(item) {
    let produto = null;
    let gtin = '';
    let sku = String(item.codigo || '');

    if (item.idProduto) {
      try {
        produto = olistGet_('/produtos/' + encodeURIComponent(item.idProduto));
        gtin = somenteDigitos_(produto.gtin || '');
        sku = String(produto.sku || sku);
      } catch (err) {
        // A nota continua utilizável mesmo se o detalhe do produto falhar.
      }
    }

    return {
      idItemNota: item.idItem || '',
      idProdutoOlist: item.idProduto || '',
      sku: sku,
      codigoNota: String(item.codigo || ''),
      descricao: String(item.descricao || ''),
      quantidade: Number(item.quantidade || 0),
      gtin: gtin,
      valorUnitario: Number(item.valorUnitario || 0),
      valorTotal: Number(item.valorTotal || 0)
    };
  });

  return {
    ok: true,
    fonte: 'OLIST',
    nota: {
      id: nota.id || resumo.id,
      numero: String(nota.numero || resumo.numero || numeroNfe),
      serie: String(nota.serie || resumo.serie || ''),
      chaveAcesso: chave,
      dataEmissao: String(nota.dataEmissao || resumo.dataEmissao || ''),
      cliente: String((nota.cliente && nota.cliente.nome) || (resumo.cliente && resumo.cliente.nome) || ''),
      numeroPedidoEcommerce: String((nota.ecommerce && nota.ecommerce.numeroPedidoEcommerce) || ''),
      canalVenda: String((nota.ecommerce && nota.ecommerce.canalVenda) || ''),
      origemId: String((nota.origem && nota.origem.id) || ''),
      itens: itens
    }
  };
}

function numeroNfeDaChave_(chave) {
  // Estrutura NF-e: UF(2)+AAMM(4)+CNPJ(14)+modelo(2)+serie(3)+numero(9)+...
  const bloco = chave.substring(25, 34);
  const numero = parseInt(bloco, 10);
  if (!isFinite(numero)) throw new Error('NUMERO_NFE_INVALIDO_NA_CHAVE');
  return numero;
}

function olistGet_(path, params) {
  const token = obterAccessTokenOlist_();
  const qs = params ? '?' + query_(params) : '';
  const resp = UrlFetchApp.fetch(OLIST.API_BASE + path + qs, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });

  const status = resp.getResponseCode();
  const body = parseJson_(resp.getContentText());
  if (status < 200 || status >= 300) {
    throw new Error('OLIST_API_' + status + '_' + JSON.stringify(body));
  }
  return body;
}

function obterAccessTokenOlist_() {
  const props = PropertiesService.getScriptProperties();
  const access = props.getProperty('OLIST_ACCESS_TOKEN');
  const refresh = props.getProperty('OLIST_REFRESH_TOKEN');
  const expiraEm = Number(props.getProperty('OLIST_ACCESS_EXPIRES_AT') || 0);

  if (access && Date.now() < expiraEm) return access;
  if (!refresh) throw new Error('OLIST_NAO_AUTORIZADA');

  const clientId = props.getProperty('OLIST_CLIENT_ID');
  const clientSecret = props.getProperty('OLIST_CLIENT_SECRET');

  const resp = UrlFetchApp.fetch(OLIST.TOKEN_URL, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh
    },
    muteHttpExceptions: true
  });

  const status = resp.getResponseCode();
  const body = parseJson_(resp.getContentText());
  if (status < 200 || status >= 300 || !body.access_token) {
    props.deleteProperty('OLIST_ACCESS_TOKEN');
    props.deleteProperty('OLIST_REFRESH_TOKEN');
    throw new Error('OLIST_REAUTORIZACAO_NECESSARIA');
  }

  salvarTokensOlist_(body);
  return body.access_token;
}

function salvarTokensOlist_(body) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('OLIST_ACCESS_TOKEN', String(body.access_token));
  if (body.refresh_token) props.setProperty('OLIST_REFRESH_TOKEN', String(body.refresh_token));

  const segundos = Number(body.expires_in || 14400);
  // Renovar um minuto antes do vencimento.
  props.setProperty('OLIST_ACCESS_EXPIRES_AT', String(Date.now() + Math.max(60, segundos - 60) * 1000));
}

function temTokenOlist_() {
  const props = PropertiesService.getScriptProperties();
  return Boolean(props.getProperty('OLIST_ACCESS_TOKEN') || props.getProperty('OLIST_REFRESH_TOKEN'));
}

function query_(obj) {
  return Object.keys(obj)
    .filter(function(k) { return obj[k] !== undefined && obj[k] !== null && obj[k] !== ''; })
    .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(obj[k])); })
    .join('&');
}

function somenteDigitos_(v) {
  return String(v || '').replace(/\D/g, '');
}

function parseJson_(text) {
  try { return JSON.parse(text || '{}'); }
  catch (e) { return { bruto: String(text || '') }; }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonp_(e, obj) {
  const cb = String((e && e.parameter && e.parameter.callback) || '')
    .replace(/[^a-zA-Z0-9_.$]/g, '');
  if (!cb) return json_(obj);

  return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
