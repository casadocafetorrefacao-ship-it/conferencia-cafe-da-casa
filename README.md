# Conferência Café da Casa

Protótipo gratuito de conferência de pedidos por DANFE + código de barras dos produtos.

## Objetivo

O funcionário abre o sistema no celular, lê a DANFE, carrega os itens esperados e confere cada pacote fisicamente.

O sistema foi desenhado para o cenário real em que alguns EANs comerciais são compartilhados por mais de uma variação de produto. Nesses casos, o pedido limita as opções possíveis e o operador confirma visualmente a variação correta.

## Regras do protótipo

- DANFE: leitura por câmera de chave NF-e com 44 dígitos.
- Produto: leitura do EAN comercial já impresso na embalagem.
- EAN compartilhado: o sistema não adivinha a torra/formato; mostra somente as variações pendentes compatíveis com aquele pedido.
- Quantidade: após atingir a quantidade pedida, novas leituras do mesmo item são bloqueadas.
- Produto fora do pedido: leitura é rejeitada.
- Prevenção contra o mesmo pacote ser lido várias vezes: processo físico `NÃO CONFERIDO -> BEEP -> CONFERIDO`, com uma leitura por vez.

## Limitação física importante

Se três embalagens possuem exatamente o mesmo EAN, nenhuma câmera consegue distinguir se foram três embalagens diferentes ou a mesma embalagem lida três vezes. Para rastreabilidade absoluta por unidade seria necessário um serial único em cada pacote.

## Arquitetura gratuita planejada

1. Front-end estático neste repositório, publicado por GitHub Pages.
2. Leitura de códigos no navegador usando ZXing.
3. Google Sheets `Beep` como banco operacional.
4. Google Apps Script como ponte entre o site e a planilha na etapa de integração.
5. Nenhuma senha, token ou chave secreta deve ser armazenada neste repositório público.

## Segurança

Este repositório público contém somente código e cenários fictícios. Dados reais de clientes, chaves NF-e reais e credenciais não devem ser versionados aqui.

## Status

- [x] Interface mobile
- [x] Scanner de DANFE e EAN
- [x] Cenário de quantidade 3/3
- [x] Cenário com duas torras usando o mesmo EAN
- [x] Bloqueio de quantidade excedida
- [x] Rejeição de produto fora do pedido
- [ ] Publicação do GitHub Pages
- [ ] Backend conectado à planilha
- [ ] Importação automática de novos pedidos
- [ ] Dashboard operacional
