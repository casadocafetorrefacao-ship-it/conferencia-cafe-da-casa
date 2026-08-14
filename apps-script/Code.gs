const SHEETS = {
  PEDIDOS: 'PEDIDOS',
  ITENS: 'ITENS_PEDIDO',
  CONFERENCIAS: 'CONFERENCIAS',
  PRODUTOS: 'PRODUTOS',
  CODIGOS: 'CODIGOS_BARRAS'
};

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.acao) || 'ping').toLowerCase();
    if (action === 'ping') return jsonp_(e, { ok: true, service: 'Conferencia Cafe da Casa' });
    if (action === 'pedido') return jsonp_(e, getPedido_(e.parameter.chave || ''));
    return jsonp_(e, { ok: false, erro: 'AÇÃO_INVÁLIDA' });
  } catch (err) {
    return jsonp_(e, { ok: false, erro: 'ERRO_INTERNO', detalhe: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};
    validarToken_(p.token);
    const action = String(p.acao || '').toLowerCase();
    if (action !== 'registrar') return json_({ ok: false, erro: 'AÇÃO_INVÁLIDA' });
    return json_(registrarConferencia_(p));
  } catch (err) {
    return json_({ ok: false, erro: 'ERRO', detalhe: String(err && err.message || err) });
  }
}

function getPedido_(chave) {
  chave = somenteDigitos_(chave);
  if (chave.length !== 44) return { ok: false, erro: 'CHAVE_NFE_INVÁLIDA' };

  const ss = getDb_();
  const pedidos = sheetObjects_(ss.getSheetByName(SHEETS.PEDIDOS));
  const pedido = pedidos.find(r => somenteDigitos_(r.ChaveNFe) === chave);
  if (!pedido) return { ok: false, erro: 'PEDIDO_NÃO_ENCONTRADO', chave: chave };

  const itens = sheetObjects_(ss.getSheetByName(SHEETS.ITENS))
    .filter(r => String(r.PedidoID) === String(pedido.PedidoID))
    .map(r => ({
      itemId: String(r.ItemID || ''),
      pedidoId: String(r.PedidoID || ''),
      produtoId: String(r.ProdutoID || ''),
      codigoInterno: String(r.CodigoInterno || ''),
      sku: String(r.SKU || ''),
      produto: String(r.Produto || ''),
      quantidadePedida: Number(r.QuantidadePedida || 0),
      quantidadeConferida: Number(r.QuantidadeConferida || 0),
      status: String(r.StatusItem || 'AGUARDANDO')
    }));

  return {
    ok: true,
    pedido: {
      pedidoId: String(pedido.PedidoID || ''),
      chaveNFe: String(pedido.ChaveNFe || ''),
      numeroNFe: String(pedido.NumeroNFe || ''),
      numeroPedido: String(pedido.NumeroPedido || ''),
      cliente: String(pedido.Cliente || ''),
      status: String(pedido.StatusConferencia || 'AGUARDANDO'),
      totalItens: Number(pedido.TotalItens || 0),
      totalConferidos: Number(pedido.TotalConferidos || 0),
      itens: itens
    }
  };
}

function registrarConferencia_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = getDb_();
    const shItens = ss.getSheetByName(SHEETS.ITENS);
    const shConf = ss.getSheetByName(SHEETS.CONFERENCIAS);
    const shPedidos = ss.getSheetByName(SHEETS.PEDIDOS);

    const pedidoId = String(p.pedidoId || '');
    const itemId = String(p.itemId || '');
    const codigo = String(p.codigoLido || '').trim();
    if (!pedidoId || !itemId || !codigo) throw new Error('DADOS_INCOMPLETOS');

    const itemRow = findRowByHeaderValue_(shItens, 'ItemID', itemId);
    if (!itemRow) throw new Error('ITEM_NÃO_ENCONTRADO');
    const item = rowObject_(shItens, itemRow);
    if (String(item.PedidoID) !== pedidoId) throw new Error('ITEM_FORA_DO_PEDIDO');

    const conferidasAntes = Number(item.QuantidadeConferida || 0);
    const pedidas = Number(item.QuantidadePedida || 0);
    let resultado = String(p.resultado || 'CORRETO').toUpperCase();

    if (resultado === 'CORRETO' && conferidasAntes >= pedidas) resultado = 'QUANTIDADE EXCEDIDA';

    const id = 'CONF-' + Utilities.getUuid();
    shConf.appendRow([
      id,
      pedidoId,
      itemId,
      String(item.ProdutoID || p.produtoId || ''),
      codigo,
      new Date(),
      String(p.usuario || ''),
      resultado,
      String(p.observacao || '')
    ]);

    recalcularPedido_(ss, pedidoId);
    return { ok: true, conferenciaId: id, resultado: resultado };
  } finally {
    lock.releaseLock();
  }
}

function recalcularPedido_(ss, pedidoId) {
  const shItens = ss.getSheetByName(SHEETS.ITENS);
  const shConf = ss.getSheetByName(SHEETS.CONFERENCIAS);
  const shPedidos = ss.getSheetByName(SHEETS.PEDIDOS);

  const itens = sheetObjectsWithRows_(shItens).filter(x => String(x.data.PedidoID) === String(pedidoId));
  const confs = sheetObjects_(shConf).filter(x => String(x.PedidoID) === String(pedidoId));
  const corretas = confs.filter(x => String(x.Resultado).toUpperCase() === 'CORRETO');
  const divergencia = confs.some(x => String(x.Resultado).toUpperCase() !== 'CORRETO');

  let totalPedidas = 0;
  let totalConferidas = 0;

  itens.forEach(({ row, data }) => {
    const qPed = Number(data.QuantidadePedida || 0);
    const qConf = corretas.filter(c => String(c.ItemID) === String(data.ItemID)).length;
    const limitada = Math.min(qConf, qPed);
    totalPedidas += qPed;
    totalConferidas += limitada;

    let status = 'AGUARDANDO';
    if (limitada > 0 && limitada < qPed) status = 'PARCIAL';
    if (qPed > 0 && limitada >= qPed) status = 'CONFERIDO';
    setByHeader_(shItens, row, 'QuantidadeConferida', limitada);
    setByHeader_(shItens, row, 'StatusItem', status);
  });

  const pedidoRow = findRowByHeaderValue_(shPedidos, 'PedidoID', pedidoId);
  if (!pedidoRow) throw new Error('PEDIDO_NÃO_ENCONTRADO');

  let statusPedido = 'AGUARDANDO';
  if (divergencia) statusPedido = 'DIVERGÊNCIA';
  else if (totalPedidas > 0 && totalConferidas >= totalPedidas) statusPedido = 'CONFERIDO';
  else if (totalConferidas > 0) statusPedido = 'EM CONFERÊNCIA';

  setByHeader_(shPedidos, pedidoRow, 'TotalItens', totalPedidas);
  setByHeader_(shPedidos, pedidoRow, 'TotalConferidos', totalConferidas);
  setByHeader_(shPedidos, pedidoRow, 'StatusConferencia', statusPedido);
  if (totalConferidas > 0) {
    const inicio = getByHeader_(shPedidos, pedidoRow, 'InicioConferencia');
    if (!inicio) setByHeader_(shPedidos, pedidoRow, 'InicioConferencia', new Date());
  }
  if (statusPedido === 'CONFERIDO') setByHeader_(shPedidos, pedidoRow, 'FimConferencia', new Date());
}

function getDb_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID_NÃO_CONFIGURADO');
  return SpreadsheetApp.openById(id);
}

function validarToken_(token) {
  const esperado = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!esperado || String(token || '') !== esperado) throw new Error('NÃO_AUTORIZADO');
}

function sheetObjects_(sheet) {
  if (!sheet) throw new Error('ABA_NÃO_ENCONTRADA');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(r => r.some(v => v !== '')).map(r => objectFromRow_(headers, r));
}

function sheetObjectsWithRows_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map((r, i) => ({ row: i + 2, data: objectFromRow_(headers, r) }))
    .filter(x => Object.values(x.data).some(v => v !== ''));
}

function objectFromRow_(headers, row) {
  const o = {};
  headers.forEach((h, i) => o[h] = row[i]);
  return o;
}

function rowObject_(sheet, row) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const vals = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
  return objectFromRow_(headers, vals);
}

function headerMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const map = {};
  headers.forEach((h, i) => map[h] = i + 1);
  return map;
}

function findRowByHeaderValue_(sheet, header, value) {
  const map = headerMap_(sheet);
  const col = map[header];
  if (!col) throw new Error('COLUNA_NÃO_ENCONTRADA_' + header);
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const vals = sheet.getRange(2, col, last - 1, 1).getDisplayValues();
  for (let i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(value)) return i + 2;
  return null;
}

function getByHeader_(sheet, row, header) {
  const col = headerMap_(sheet)[header];
  if (!col) throw new Error('COLUNA_NÃO_ENCONTRADA_' + header);
  return sheet.getRange(row, col).getValue();
}

function setByHeader_(sheet, row, header, value) {
  const col = headerMap_(sheet)[header];
  if (!col) throw new Error('COLUNA_NÃO_ENCONTRADA_' + header);
  sheet.getRange(row, col).setValue(value);
}

function somenteDigitos_(v) {
  return String(v || '').replace(/\D/g, '');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function jsonp_(e, obj) {
  const cb = String((e && e.parameter && e.parameter.callback) || '').replace(/[^a-zA-Z0-9_.$]/g, '');
  if (!cb) return json_(obj);
  return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
