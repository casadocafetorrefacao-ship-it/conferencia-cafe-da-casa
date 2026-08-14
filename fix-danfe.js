// Correção do protótipo: ao ler uma DANFE real, nunca manter na tela um pedido de teste anterior.
// Este arquivo é carregado depois do script principal e substitui apenas o tratamento da DANFE.
window.handleDanfe = function(code) {
  const digits = String(code || '').replace(/\D/g, '');

  currentOrder = null;
  show('orderCard', false);
  show('choiceCard', false);

  if (digits.length !== 44) {
    beep(false);
    msg('❌ O código lido não tem 44 dígitos. Não parece ser a chave da DANFE.<br><b>' + escapeHtml(code) + '</b>', 'danger');
    return;
  }

  const o = orderByKey(digits);
  if (!o) {
    beep(true);
    const agrupada = digits.match(/.{1,4}/g).join(' ');
    msg(
      '✅ <b>DANFE REAL LIDA COM SUCESSO.</b><br><br>' +
      '<span class="small">Chave capturada</span><br>' +
      '<div style="font-family:monospace;font-size:14px;line-height:1.7;word-break:break-word;margin:6px 0 10px">' + agrupada + '</div>' +
      '<b>O pedido ainda não está cadastrado na base deste protótipo.</b><br>' +
      'Nenhum produto foi associado automaticamente a esta DANFE.',
      'ok'
    );
    return;
  }

  currentOrder = o;
  beep(true);
  renderOrder();
  show('orderCard', true);
  msg('✅ DANFE de teste reconhecida. Pedido carregado.', 'ok');
};
