const OLIST = {
  AUTH_URL: 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth',
  TOKEN_URL: 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
  API_BASE: 'https://api.tiny.com.br/public-api/v3'
};

const SHEETS = {
  PEDIDOS: 'PEDIDOS', ITENS: 'ITENS_PEDIDO', CONFERENCIAS: 'CONFERENCIAS',
  CODIGOS_INTERNOS: 'CODIGOS_INTERNOS', CODIGOS_BARRAS: 'CODIGOS_BARRAS'
};

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.code) return concluirOAuthOlist_(p.code);
    const acao = String(p.acao || 'ping').toLowerCase();
    if (acao === 'ping') return jsonp_(e, {ok:true, servico:'Conferencia Cafe da Casa', versao:'2.1', olistAutorizada:temTokenOlist_()});
    if (acao === 'autorizar') return iniciarOAuthOlist_();
    if (acao === 'status_olist') return jsonp_(e, statusOlist_());
    if (acao === 'danfe') return jsonp_(e, buscarDanfeOlist_(p.chave || ''));
    if (acao === 'pedido') return jsonp_(e, getPedidoBase_(p.pedidoId || '', p.chave || ''));
    if (acao === 'registrar') return jsonp_(e, registrarConferencia_(p));
    if (acao === 'dashboard') return jsonp_(e, dashboard_());
    return jsonp_(e, {ok:false, erro:'ACAO_INVALIDA'});
  } catch (err) {
    return jsonp_(e, {ok:false, erro:'ERRO_INTERNO', detalhe:String(err && err.message || err)});
  }
}

function doPost(e) {
  try {
    let p = {};
    if (e && e.postData && e.postData.contents) { try { p = JSON.parse(e.postData.contents); } catch (err) {} }
    if (!Object.keys(p).length && e && e.parameter) p = e.parameter;
    const acao = String(p.acao || '').toLowerCase();
    if (acao === 'registrar') return json_(registrarConferencia_(p));
    if (acao === 'danfe') return json_(buscarDanfeOlist_(p.chave || ''));
    if (acao === 'dashboard') return json_(dashboard_());
    if (acao === 'status_olist') return json_(statusOlist_());
    return json_({ok:false, erro:'ACAO_INVALIDA'});
  } catch (err) {
    return json_({ok:false, erro:'ERRO_INTERNO', detalhe:String(err && err.message || err)});
  }
}

function iniciarOAuthOlist_() {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('OLIST_CLIENT_ID');
  if (!clientId) throw new Error('OLIST_CLIENT_ID_NAO_CONFIGURADO');
  const redirectUri = ScriptApp.getService().getUrl();
  const url = OLIST.AUTH_URL + '?' + query_({client_id:clientId, redirect_uri:redirectUri, scope:'openid', response_type:'code'});
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_top"></head><body style="font-family:Arial;background:#f3efe9;padding:30px"><div style="max-width:560px;margin:50px auto;background:#fff;padding:24px;border-radius:16px"><h2>Conectar com a Olist</h2><p>Clique abaixo para autorizar a consulta de notas, pedidos e produtos.</p><a target="_top" href="'+htmlAttr_(url)+'" style="display:inline-block;background:#2a2019;color:#fff;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:bold">Autorizar na Olist</a></div></body></html>');
}

function concluirOAuthOlist_(code) {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('OLIST_CLIENT_ID'), clientSecret = props.getProperty('OLIST_CLIENT_SECRET');
  const redirectUri = ScriptApp.getService().getUrl();
  if (!clientId || !clientSecret) throw new Error('CREDENCIAIS_OLIST_NAO_CONFIGURADAS');
  const resp = UrlFetchApp.fetch(OLIST.TOKEN_URL,{method:'post',contentType:'application/x-www-form-urlencoded',payload:{grant_type:'authorization_code',client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,code:code},muteHttpExceptions:true});
  const status=resp.getResponseCode(), body=parseJson_(resp.getContentText());
  if(status<200||status>=300||!body.access_token) throw new Error('FALHA_OAUTH_OLIST_'+status);
  salvarTokensOlist_(body);
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial;background:#f3efe9;padding:30px"><div style="max-width:600px;margin:40px auto;background:#fff;padding:24px;border-radius:16px"><h2 style="color:#18794e">✅ Olist conectada com sucesso</h2><p>Pode fechar esta página.</p></div></body></html>');
}

function buscarDanfeOlist_(chave) {
  chave = somenteDigitos_(chave);
  if (chave.length !== 44) return {ok:false, erro:'CHAVE_NFE_INVALIDA'};
  const numeroNfe = numeroNfeDaChave_(chave);
  const lista = olistGet_('/notas',{tipo:'S',numero:numeroNfe,limit:100,offset:0});
  const resumo = arrayDeResposta_(lista).find(function(n){return somenteDigitos_(n.chaveAcesso)===chave;});
  if(!resumo) return {ok:false,erro:'NOTA_NAO_ENCONTRADA_NA_OLIST',chave:chave,numeroNFe:numeroNfe};
  const nota=olistGet_('/notas/'+encodeURIComponent(resumo.id));
  const itens=(Array.isArray(nota.itens)?nota.itens:[]).map(function(item){
    let gtin='',skuOlist=String(item.codigo||'');
    if(item.idProduto){try{const produto=olistGet_('/produtos/'+encodeURIComponent(item.idProduto));gtin=somenteDigitos_(produto.gtin||produto.gtin13||'');skuOlist=String(produto.sku||produto.codigo||skuOlist);}catch(err){}}
    return {idItemNota:item.idItem||item.id||'',idProdutoOlist:item.idProduto||'',skuOlist:skuOlist,codigoNota:String(item.codigo||''),descricao:String(item.descricao||''),quantidade:Number(item.quantidade||0),gtinOlist:gtin,valorUnitario:Number(item.valorUnitario||0),valorTotal:Number(item.valorTotal||0)};
  });
  const n={id:nota.id||resumo.id,numero:String(nota.numero||resumo.numero||numeroNfe),serie:String(nota.serie||resumo.serie||''),chaveAcesso:chave,dataEmissao:String(nota.dataEmissao||resumo.dataEmissao||''),cliente:String((nota.cliente&&nota.cliente.nome)||(resumo.cliente&&resumo.cliente.nome)||''),numeroPedidoEcommerce:String((nota.ecommerce&&nota.ecommerce.numeroPedidoEcommerce)||''),canalVenda:String((nota.ecommerce&&nota.ecommerce.canalVenda)||''),origemId:String((nota.origem&&nota.origem.id)||''),itens:itens};
  const base=sincronizarNotaNaBase_(n);
  return {ok:true,fonte:'OLIST',nota:Object.assign({},n,{pedidoId:base.pedidoId,statusConferencia:base.status,totalConferidos:base.totalConferidos,itens:base.itens})};
}

function sincronizarNotaNaBase_(nota) {
  const lock=LockService.getScriptLock(); lock.waitLock(15000);
  try{
    const ss=getDb_(), shP=requireSheet_(ss,SHEETS.PEDIDOS), shI=requireSheet_(ss,SHEETS.ITENS), cat=carregarCatalogo_(ss);
    let pr=findRowByHeaderValue_(shP,'ChaveNFe',nota.chaveAcesso), pedidoId;
    if(pr){const a=rowObject_(shP,pr);pedidoId=String(a.PedidoID||'');setByHeader_(shP,pr,'NumeroNFe',semZerosEsquerda_(nota.numero));if(nota.numeroPedidoEcommerce)setByHeader_(shP,pr,'NumeroPedido',nota.numeroPedidoEcommerce);if(nota.cliente)setByHeader_(shP,pr,'Cliente',nota.cliente);if(nota.dataEmissao)setByHeader_(shP,pr,'DataEmissao',parseDate_(nota.dataEmissao));setByHeader_(shP,pr,'Origem','OLIST API');}
    else{pedidoId='PED-OLIST-'+String(nota.id||Utilities.getUuid());pr=nextDataRow_(shP);writeRowByHeaders_(shP,pr,{PedidoID:pedidoId,ChaveNFe:nota.chaveAcesso,NumeroNFe:semZerosEsquerda_(nota.numero),NumeroPedido:nota.numeroPedidoEcommerce,Cliente:nota.cliente,DataEmissao:parseDate_(nota.dataEmissao),StatusConferencia:'AGUARDANDO',TotalItens:0,TotalConferidos:0,InicioConferencia:'',FimConferencia:'',ConferidoPor:'',Origem:'OLIST API'});}
    nota.itens.forEach(function(item,index){const m=mapearItemOlist_(item,cat),stable=item.idItemNota||(String(nota.id)+'-'+String(index+1)),itemId='ITEM-OLIST-'+stable;let ir=findRowByHeaderValue_(shI,'ItemID',itemId);if(!ir)ir=nextDataRow_(shI);const anterior=ir<=shI.getLastRow()?rowObject_(shI,ir):{},q=Number(anterior.QuantidadeConferida||0),ped=Number(item.quantidade||0);writeRowByHeaders_(shI,ir,{ItemID:itemId,PedidoID:pedidoId,ProdutoID:m.produtoId,CodigoInterno:m.codigoInterno,SKU:m.sku,Produto:m.label||item.descricao,QuantidadePedida:ped,QuantidadeConferida:q,StatusItem:q>0?(q>=ped?'CONFERIDO':'PARCIAL'):'AGUARDANDO'});});
    recalcularPedido_(ss,pedidoId); return getPedidoBase_(pedidoId,'');
  }finally{lock.releaseLock();}
}

function registrarConferencia_(p) {
  const pedidoId=String(p.pedidoId||''), itemId=String(p.itemId||''), codigo=String(p.codigoLido||'').trim(), usuario=limparUsuario_(p.usuario||'Não informado'), visual=String(p.confirmacaoVisual||'').toUpperCase()==='SIM';
  if(!pedidoId||!codigo)return {ok:false,erro:'DADOS_INCOMPLETOS'};
  const lock=LockService.getScriptLock(); lock.waitLock(15000);
  try{
    const ss=getDb_(),shP=requireSheet_(ss,SHEETS.PEDIDOS),shI=requireSheet_(ss,SHEETS.ITENS),shC=requireSheet_(ss,SHEETS.CONFERENCIAS); const pr=findRowByHeaderValue_(shP,'PedidoID',pedidoId); if(!pr)return {ok:false,erro:'PEDIDO_NAO_ENCONTRADO'};
    let item=null;if(itemId){const ir=findRowByHeaderValue_(shI,'ItemID',itemId);if(!ir)return {ok:false,erro:'ITEM_NAO_ENCONTRADO'};item=rowObject_(shI,ir);if(String(item.PedidoID)!==pedidoId)return {ok:false,erro:'ITEM_FORA_DO_PEDIDO'};}
    let resultado='NÃO ENCONTRADO',obs=String(p.observacao||''),conhecido=localizarCodigo_(ss,codigo);
    if(item){if(codigoServeParaSku_(ss,codigo,String(item.SKU||''))){const ped=Number(item.QuantidadePedida||0),atual=contarCorretas_(shC,pedidoId,String(item.ItemID||''));if(atual>=ped){resultado='QUANTIDADE EXCEDIDA';obs=juntarObs_(obs,'Quantidade pedida já atingida.');}else{resultado='CORRETO';if(visual)obs=juntarObs_(obs,'Variação confirmada visualmente.');}}else{resultado=conhecido?'PRODUTO ERRADO':'NÃO ENCONTRADO';obs=juntarObs_(obs,conhecido?'Código pertence a outro produto/variação.':'Código não localizado no cadastro.');}}
    else resultado=conhecido?'PRODUTO ERRADO':'NÃO ENCONTRADO';
    const cid='CONF-'+Utilities.getUuid(),cr=nextDataRow_(shC);writeRowByHeaders_(shC,cr,{ConferenciaID:cid,PedidoID:pedidoId,ItemID:item?String(item.ItemID||''):'',ProdutoID:item?String(item.ProdutoID||''):'',CodigoLido:codigo,DataHora:new Date(),Usuario:usuario,Resultado:resultado,Observacao:obs});
    const pa=rowObject_(shP,pr);if(!pa.InicioConferencia)setByHeader_(shP,pr,'InicioConferencia',new Date());if(!pa.ConferidoPor)setByHeader_(shP,pr,'ConferidoPor',usuario);else if(usuario&&String(pa.ConferidoPor).indexOf(usuario)<0)setByHeader_(shP,pr,'ConferidoPor',String(pa.ConferidoPor)+', '+usuario);
    recalcularPedido_(ss,pedidoId);return {ok:true,conferenciaId:cid,resultado:resultado,pedido:getPedidoBase_(pedidoId,'')};
  }finally{lock.releaseLock();}
}

function recalcularPedido_(ss,pedidoId){
  const shI=requireSheet_(ss,SHEETS.ITENS),shC=requireSheet_(ss,SHEETS.CONFERENCIAS),shP=requireSheet_(ss,SHEETS.PEDIDOS);const itens=sheetObjectsWithRows_(shI).filter(x=>String(x.data.PedidoID)===pedidoId),confs=sheetObjects_(shC).filter(x=>String(x.PedidoID)===pedidoId),corretas=confs.filter(x=>String(x.Resultado).toUpperCase()==='CORRETO'),div=confs.some(x=>['PRODUTO ERRADO','QUANTIDADE EXCEDIDA','NÃO ENCONTRADO'].indexOf(String(x.Resultado).toUpperCase())>=0);let tp=0,tc=0;
  itens.forEach(function(x){const q=Number(x.data.QuantidadePedida||0),c=corretas.filter(y=>String(y.ItemID)===String(x.data.ItemID)).length,l=Math.min(c,q);tp+=q;tc+=l;setByHeader_(shI,x.row,'QuantidadeConferida',l);setByHeader_(shI,x.row,'StatusItem',l===0?'AGUARDANDO':(l>=q?'CONFERIDO':'PARCIAL'));});
  const pr=findRowByHeaderValue_(shP,'PedidoID',pedidoId);if(!pr)throw new Error('PEDIDO_NAO_ENCONTRADO');let st='AGUARDANDO';if(div)st='DIVERGÊNCIA';else if(tp>0&&tc>=tp)st='CONFERIDO';else if(tc>0)st='EM CONFERÊNCIA';setByHeader_(shP,pr,'TotalItens',tp);setByHeader_(shP,pr,'TotalConferidos',tc);setByHeader_(shP,pr,'StatusConferencia',st);if(st==='CONFERIDO'){if(!getByHeader_(shP,pr,'FimConferencia'))setByHeader_(shP,pr,'FimConferencia',new Date());}else setByHeader_(shP,pr,'FimConferencia','');
}

function getPedidoBase_(pedidoId,chave){
  const ss=getDb_(),shP=requireSheet_(ss,SHEETS.PEDIDOS),shI=requireSheet_(ss,SHEETS.ITENS);let r=pedidoId?findRowByHeaderValue_(shP,'PedidoID',pedidoId):null;if(!r&&chave)r=findRowByHeaderValue_(shP,'ChaveNFe',somenteDigitos_(chave));if(!r)return {ok:false,erro:'PEDIDO_NAO_ENCONTRADO'};const p=rowObject_(shP,r),cat=carregarCatalogo_(ss),itens=sheetObjects_(shI).filter(i=>String(i.PedidoID)===String(p.PedidoID)).map(function(i){return {itemId:String(i.ItemID||''),pedidoId:String(i.PedidoID||''),produtoId:String(i.ProdutoID||''),codigoInterno:String(i.CodigoInterno||''),sku:String(i.SKU||''),produto:String(i.Produto||''),quantidadePedida:Number(i.QuantidadePedida||0),quantidadeConferida:Number(i.QuantidadeConferida||0),status:String(i.StatusItem||'AGUARDANDO'),eansImpressos:eansImpressosDoSku_(cat,String(i.SKU||''))};});return {ok:true,pedidoId:String(p.PedidoID||''),chaveNFe:String(p.ChaveNFe||''),numeroNFe:String(p.NumeroNFe||''),numeroPedido:String(p.NumeroPedido||''),cliente:String(p.Cliente||''),dataEmissao:formatDateIso_(p.DataEmissao),status:String(p.StatusConferencia||'AGUARDANDO'),totalItens:Number(p.TotalItens||0),totalConferidos:Number(p.TotalConferidos||0),inicioConferencia:formatDateTimeIso_(p.InicioConferencia),fimConferencia:formatDateTimeIso_(p.FimConferencia),conferidoPor:String(p.ConferidoPor||''),origem:String(p.Origem||''),itens:itens};
}

function dashboard_(){const ss=getDb_(),pedidos=sheetObjects_(requireSheet_(ss,SHEETS.PEDIDOS)).filter(p=>String(p.Origem||'').indexOf('TESTE')<0).slice(-100).reverse().map(p=>({pedidoId:String(p.PedidoID||''),numeroPedido:String(p.NumeroPedido||''),numeroNFe:String(p.NumeroNFe||''),cliente:String(p.Cliente||''),status:String(p.StatusConferencia||'AGUARDANDO'),totalItens:Number(p.TotalItens||0),totalConferidos:Number(p.TotalConferidos||0),inicio:formatDateTimeIso_(p.InicioConferencia),fim:formatDateTimeIso_(p.FimConferencia),conferidoPor:String(p.ConferidoPor||'')}));const c={'AGUARDANDO':0,'EM CONFERÊNCIA':0,'CONFERIDO':0,'DIVERGÊNCIA':0};pedidos.forEach(p=>{if(c[p.status]!==undefined)c[p.status]++;});return {ok:true,contagens:c,pedidos:pedidos};}

function mapearItemOlist_(item,cat){const attrs=inferirAtributos_(normalizar_(item.descricao));let c=null;if(item.skuOlist)c=cat.produtos.find(p=>p.sku===String(item.skuOlist).trim()||p.codigoInterno===String(item.skuOlist).trim());if(!c&&attrs){const es=cat.produtos.filter(p=>normalizar_(p.linha)===normalizar_(attrs.linha)&&normalizar_(p.formato)===normalizar_(attrs.formato)&&normalizar_(p.peso)===normalizar_(attrs.peso)&&normalizar_(p.torra)===normalizar_(attrs.torra));if(es.length===1)c=es[0];}if(!c)return {produtoId:'',codigoInterno:'',sku:'',label:String(item.descricao||'')};return {produtoId:c.produtoId,codigoInterno:c.codigoInterno,sku:c.sku,label:c.produto+' | '+c.formato+' | '+c.peso+' | '+c.torra};}

function inferirAtributos_(d){let linha='';if(d.indexOf('moca')>=0||d.indexOf('arara')>=0)linha='Moca Arara';else if(d.indexOf('botelhos especial')>=0)linha='Botelhos Especial';else if(d.indexOf('botelhos forte')>=0)linha='Botelhos Forte';else if(d.indexOf('transparente')>=0)linha='Transparente';else if(d.indexOf('tradicional')>=0)linha='Tradicional';else if(d.indexOf('especial')>=0)linha='Especial';else if(d.indexOf('gourmet')>=0)linha='Gourmet';else if(d.indexOf('forte')>=0)linha='Forte';else return null;let formato='';if(d.indexOf('grao')>=0)formato='Grãos';else if(d.indexOf('moid')>=0)formato='Moído';else if(['Tradicional','Forte','Botelhos Forte','Botelhos Especial','Transparente'].indexOf(linha)>=0)formato='Moído';else return null;let peso='';if(/\b(1\s*kg|1000\s*g)\b/.test(d))peso='1 kg';else if(/\b500\s*g\b/.test(d))peso='500 g';else if(/\b250\s*g\b/.test(d))peso='250 g';else if(/\b5\s*kg\b/.test(d))peso='5 kg';else return null;let torra='';if(d.indexOf('medio')>=0||d.indexOf('media')>=0)torra='Média';else if(d.indexOf('claro')>=0||d.indexOf('clara')>=0)torra='Clara';else if(d.indexOf('escuro')>=0||d.indexOf('escura')>=0)torra='Escura';else if(['Tradicional','Forte','Botelhos Forte'].indexOf(linha)>=0)torra='Escura';else if(linha==='Botelhos Especial')torra='Média';else return null;return {linha:linha,formato:formato,peso:peso,torra:torra};}

function carregarCatalogo_(ss){const produtos=sheetObjects_(requireSheet_(ss,SHEETS.CODIGOS_INTERNOS)).map(r=>({produtoId:String(r.ProdutoID||''),codigoInterno:String(r['Código Interno']||''),sku:String(r.SKU||''),produto:String(r.Produto||''),linha:String(r.Linha||''),formato:String(r.Formato||''),peso:String(r.Peso||''),torra:String(r.Torra||'')}));const codigos=sheetObjects_(requireSheet_(ss,SHEETS.CODIGOS_BARRAS)).map(r=>({codigo:somenteDigitos_(r['Código']||''),tipo:String(r.Tipo||''),skus:String(r['SKUs associados']||'').split(',').map(s=>s.trim()).filter(Boolean)}));return {produtos:produtos,codigos:codigos};}
function eansImpressosDoSku_(cat,sku){return cat.codigos.filter(c=>normalizar_(c.tipo)==='ean impresso'&&c.skus.indexOf(sku)>=0).map(c=>c.codigo).filter(Boolean);}
function codigoServeParaSku_(ss,codigo,sku){codigo=String(codigo||'').trim();if(!codigo||!sku)return false;if(codigo===sku)return true;const cat=carregarCatalogo_(ss),p=cat.produtos.find(x=>x.sku===sku);if(p&&codigo===p.codigoInterno)return true;return eansImpressosDoSku_(cat,sku).indexOf(somenteDigitos_(codigo))>=0;}
function localizarCodigo_(ss,codigo){codigo=String(codigo||'').trim();const cat=carregarCatalogo_(ss);if(cat.produtos.some(p=>p.sku===codigo||p.codigoInterno===codigo))return true;const d=somenteDigitos_(codigo);return cat.codigos.some(c=>c.codigo===d);}
function contarCorretas_(sh,ped,item){return sheetObjects_(sh).filter(c=>String(c.PedidoID)===ped&&String(c.ItemID)===item&&String(c.Resultado).toUpperCase()==='CORRETO').length;}
function numeroNfeDaChave_(chave){const n=parseInt(chave.substring(25,34),10);if(!isFinite(n))throw new Error('NUMERO_NFE_INVALIDO_NA_CHAVE');return n;}

function olistGet_(path,params){
  const qs=params?'?'+query_(params):'';
  let token=obterAccessTokenOlist_(false,''), resposta=olistFetch_(path,qs,token), status=resposta.status, body=resposta.body;
  if(status===401){
    token=obterAccessTokenOlist_(true,token);
    resposta=olistFetch_(path,qs,token);status=resposta.status;body=resposta.body;
  }
  if(status<200||status>=300)throw new Error('OLIST_API_'+status+'_'+JSON.stringify(body));
  return body;
}

function olistFetch_(path,qs,token){
  const resp=UrlFetchApp.fetch(OLIST.API_BASE+path+qs,{method:'get',headers:{Authorization:'Bearer '+token},muteHttpExceptions:true});
  return {status:resp.getResponseCode(),body:parseJson_(resp.getContentText())};
}

function obterAccessTokenOlist_(forcarRefresh,tokenRejeitado){
  let p=PropertiesService.getScriptProperties();
  let a=p.getProperty('OLIST_ACCESS_TOKEN'),r=p.getProperty('OLIST_REFRESH_TOKEN'),exp=Number(p.getProperty('OLIST_ACCESS_EXPIRES_AT')||0);
  if(!forcarRefresh&&a&&Date.now()<exp)return a;

  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    p=PropertiesService.getScriptProperties();a=p.getProperty('OLIST_ACCESS_TOKEN');r=p.getProperty('OLIST_REFRESH_TOKEN');exp=Number(p.getProperty('OLIST_ACCESS_EXPIRES_AT')||0);
    if(!forcarRefresh&&a&&Date.now()<exp)return a;
    if(forcarRefresh&&tokenRejeitado&&a&&a!==tokenRejeitado)return a;
    if(!r){
      if(!forcarRefresh&&a)return a;
      throw new Error('OLIST_REAUTORIZACAO_NECESSARIA');
    }
    const clientId=p.getProperty('OLIST_CLIENT_ID'),clientSecret=p.getProperty('OLIST_CLIENT_SECRET');
    if(!clientId||!clientSecret)throw new Error('CREDENCIAIS_OLIST_NAO_CONFIGURADAS');
    const resp=UrlFetchApp.fetch(OLIST.TOKEN_URL,{method:'post',contentType:'application/x-www-form-urlencoded',payload:{grant_type:'refresh_token',client_id:clientId,client_secret:clientSecret,refresh_token:r},muteHttpExceptions:true});
    const status=resp.getResponseCode(),body=parseJson_(resp.getContentText());
    if(status<200||status>=300||!body.access_token){
      p.setProperty('OLIST_REFRESH_LAST_ERROR',String(status));
      p.setProperty('OLIST_REFRESH_LAST_ERROR_AT',String(Date.now()));
      throw new Error('OLIST_REAUTORIZACAO_NECESSARIA');
    }
    salvarTokensOlist_(body);return String(body.access_token);
  }finally{lock.releaseLock();}
}

function salvarTokensOlist_(b){
  const p=PropertiesService.getScriptProperties();
  p.setProperty('OLIST_ACCESS_TOKEN',String(b.access_token));
  if(b.refresh_token)p.setProperty('OLIST_REFRESH_TOKEN',String(b.refresh_token));
  const s=Number(b.expires_in||14400);
  p.setProperty('OLIST_ACCESS_EXPIRES_AT',String(Date.now()+Math.max(60,s-120)*1000));
  p.deleteProperty('OLIST_REFRESH_LAST_ERROR');p.deleteProperty('OLIST_REFRESH_LAST_ERROR_AT');
}

function statusOlist_(){
  const p=PropertiesService.getScriptProperties(),a=p.getProperty('OLIST_ACCESS_TOKEN'),r=p.getProperty('OLIST_REFRESH_TOKEN'),exp=Number(p.getProperty('OLIST_ACCESS_EXPIRES_AT')||0),agora=Date.now();
  return {ok:true,autorizada:Boolean(r||(a&&agora<exp)),accessPresente:Boolean(a),refreshPresente:Boolean(r),accessValidoAte:exp?new Date(exp).toISOString():'',ultimoErroRefresh:p.getProperty('OLIST_REFRESH_LAST_ERROR')||'',ultimoErroRefreshEm:p.getProperty('OLIST_REFRESH_LAST_ERROR_AT')||''};
}
function temTokenOlist_(){return statusOlist_().autorizada;}
function getDb_(){const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');if(!id)throw new Error('SPREADSHEET_ID_NAO_CONFIGURADO');return SpreadsheetApp.openById(id);}
function requireSheet_(ss,n){const sh=ss.getSheetByName(n);if(!sh)throw new Error('ABA_NAO_ENCONTRADA_'+n);return sh;}
function sheetObjects_(sh){const lr=sh.getLastRow(),lc=sh.getLastColumn();if(lr<2||lc<1)return[];const v=sh.getRange(1,1,lr,lc).getValues(),h=v[0].map(String);return v.slice(1).filter(r=>r.some(x=>x!=='')).map(r=>objectFromRow_(h,r));}
function sheetObjectsWithRows_(sh){const lr=sh.getLastRow(),lc=sh.getLastColumn();if(lr<2||lc<1)return[];const v=sh.getRange(1,1,lr,lc).getValues(),h=v[0].map(String);return v.slice(1).map((r,i)=>({row:i+2,data:objectFromRow_(h,r)})).filter(x=>Object.keys(x.data).some(k=>x.data[k]!==''));}
function objectFromRow_(h,r){const o={};h.forEach((x,i)=>o[x]=r[i]);return o;}
function headerMap_(sh){const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String),m={};h.forEach((x,i)=>m[x]=i+1);return m;}
function rowObject_(sh,row){const lc=sh.getLastColumn(),h=sh.getRange(1,1,1,lc).getValues()[0].map(String),v=sh.getRange(row,1,1,lc).getValues()[0];return objectFromRow_(h,v);}
function findRowByHeaderValue_(sh,header,value){const col=headerMap_(sh)[header];if(!col)throw new Error('COLUNA_NAO_ENCONTRADA_'+header);const last=sh.getLastRow();if(last<2)return null;const v=sh.getRange(2,col,last-1,1).getDisplayValues();for(let i=0;i<v.length;i++)if(String(v[i][0]).trim()===String(value).trim())return i+2;return null;}
function nextDataRow_(sh){return Math.max(2,sh.getLastRow()+1);}
function writeRowByHeaders_(sh,row,obj){const m=headerMap_(sh);Object.keys(obj).forEach(h=>{if(!m[h])throw new Error('COLUNA_NAO_ENCONTRADA_'+h);sh.getRange(row,m[h]).setValue(obj[h]);});}
function getByHeader_(sh,row,h){const c=headerMap_(sh)[h];if(!c)throw new Error('COLUNA_NAO_ENCONTRADA_'+h);return sh.getRange(row,c).getValue();}
function setByHeader_(sh,row,h,v){const c=headerMap_(sh)[h];if(!c)throw new Error('COLUNA_NAO_ENCONTRADA_'+h);sh.getRange(row,c).setValue(v);}
function arrayDeResposta_(o){if(Array.isArray(o))return o;if(o&&Array.isArray(o.itens))return o.itens;if(o&&Array.isArray(o.data))return o.data;return[];}
function normalizar_(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[|_/]+/g,' ').replace(/\s+/g,' ').trim();}
function somenteDigitos_(v){return String(v||'').replace(/\D/g,'');}
function semZerosEsquerda_(v){const s=String(v||'').replace(/\D/g,'');return s?String(parseInt(s,10)):'';}
function parseDate_(v){if(v instanceof Date)return v;const s=String(v||''),m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3])):s;}
function formatDateIso_(v){if(!v)return'';return v instanceof Date?Utilities.formatDate(v,'America/Sao_Paulo','yyyy-MM-dd'):String(v);}
function formatDateTimeIso_(v){if(!v)return'';return v instanceof Date?Utilities.formatDate(v,'America/Sao_Paulo',"yyyy-MM-dd'T'HH:mm:ss"):String(v);}
function limparUsuario_(v){return String(v||'').trim().slice(0,80);}
function juntarObs_(a,b){return [String(a||'').trim(),String(b||'').trim()].filter(Boolean).join(' ');}
function query_(o){return Object.keys(o).filter(k=>o[k]!==undefined&&o[k]!==null&&o[k]!=='').map(k=>encodeURIComponent(k)+'='+encodeURIComponent(String(o[k]))).join('&');}
function parseJson_(t){try{return JSON.parse(t||'{}');}catch(e){return{bruto:String(t||'')}}}
function htmlAttr_(v){return String(v||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function json_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function jsonp_(e,o){const cb=String((e&&e.parameter&&e.parameter.callback)||'').replace(/[^a-zA-Z0-9_.$]/g,'');if(!cb)return json_(o);return ContentService.createTextOutput(cb+'('+JSON.stringify(o)+');').setMimeType(ContentService.MimeType.JAVASCRIPT);}

function testarOlist(){console.log(JSON.stringify(statusOlist_()));}
