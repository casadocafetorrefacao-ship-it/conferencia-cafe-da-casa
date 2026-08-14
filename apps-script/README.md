# Backend gratuito com Google Apps Script

Este diretório contém o backend que será ligado à planilha `Beep`.

## O que ele faz

- procura pedido pela chave de acesso NF-e de 44 dígitos;
- retorna os itens do pedido;
- registra cada conferência na aba `CONFERENCIAS`;
- recalcula `QuantidadeConferida` e `StatusItem` em `ITENS_PEDIDO`;
- recalcula totais e status em `PEDIDOS`;
- usa `LockService` para reduzir conflito quando dois aparelhos gravarem quase ao mesmo tempo.

## Configuração necessária

1. Criar um projeto no Google Apps Script.
2. Copiar `Code.gs` para o projeto.
3. Em **Project Settings > Script properties**, criar:
   - `SPREADSHEET_ID`: ID da planilha Beep.
   - `API_TOKEN`: uma chave aleatória longa. Não colocar essa chave no GitHub.
4. Implantar como Web App, executando como o proprietário da planilha.
5. Guardar a URL `/exec` da implantação.

## Segurança

O repositório é público. Nunca salvar aqui:

- `API_TOKEN`;
- senha do Google;
- token da Shopify/Olist;
- dados completos de clientes;
- chave privada de qualquer API.

## Observação sobre câmera

A interface com câmera deve continuar hospedada fora do HTML Service do Apps Script. O ambiente HTML Service é sandboxed e bloqueia APIs de permissão sensível como `navigator.mediaDevices.getUserMedia()`.

## Próxima integração no front-end

Depois que o Web App estiver implantado, o `index.html` será alterado para:

- consultar o pedido real pela chave da DANFE;
- enviar conferências para o backend;
- manter os dados sensíveis fora do repositório;
- usar o pedido como contexto para resolver EANs compartilhados.
