# Pexlora Browser — versão 0.2.0

O Pexlora Browser é uma versão desktop experimental construída com Electron e Chromium.

## Como gerar o instalador público

O workflow do GitHub Actions já está configurado em .github/workflows/build-windows-installer.yml. O código do navegador ainda precisa ser enviado à raiz deste repositório.

1. Baixe o ZIP do projeto nesta conversa e extraia tudo.
2. No GitHub, abra este repositório e use Add file → Upload files.
3. Envie os arquivos e pastas extraídos para a raiz do repositório, incluindo package.json, main.js, preload.js, src/ e assets/. Não envie outra pasta aninhada; os arquivos precisam ficar diretamente na raiz.
4. Faça commit na branch main.
5. Abra Actions e aguarde Build Pexlora Windows installer terminar com sucesso.
6. Abra Releases e baixe Pexlora-Setup-0.2.0.exe.

A compilação é feita num Windows hospedado pelo GitHub Actions. Você não precisa instalar Node.js nem compilar no seu computador. Quem baixar o .exe final também não precisa de Node.js.

O instalador ainda não está publicado. A página Releases só terá o arquivo depois que o código for enviado e o workflow terminar com sucesso.

## O que já funciona nesta versão

- Navegação por páginas HTTP e HTTPS.
- Abas independentes, nova guia e fechar abas.
- Voltar, avançar, recarregar e página inicial.
- Favoritos e histórico locais.
- Downloads na pasta Downloads/Pexlora.
- Guias privadas com sessão separada.
- Pexlora Shields básico baseado numa lista limitada de domínios conhecidos.
- Preferência de pesquisa Google ou DuckDuckGo.

## O que ainda não está pronto

- Pexlora AI ainda não está conectada a um provedor de IA.
- Pexlora Shields é uma proteção básica, não um bloqueador completo.
- Sincronização, extensões, perfis múltiplos, tradução integrada, atualização automática e contas ainda não foram implementados.
- O navegador usa o Chromium distribuído com Electron; não é um fork independente do Chromium.

## Desenvolvimento local

Com Node.js LTS instalado, rode npm install, npm run check e npm start. Para criar o instalador manualmente em Windows, rode npm run dist:win. O arquivo será dist/Pexlora-Setup-0.2.0.exe.

## Segurança

A interface nativa e as páginas externas ficam separadas. Node Integration está desativado, Context Isolation e sandbox estão ativados. Pedidos sensíveis exigem confirmação. Esta versão é experimental; o bloqueio de rastreadores é limitado e não garante anonimato nem proteção total.


## Pexlora 0.2.0

- Página inicial redesenhada com barra lateral no estilo de navegadores modernos.
- Favoritos salvos aparecem na barra lateral e podem ser abertos com um clique.
- Logos vetoriais dos principais atalhos, evitando ícones genéricos.
- Tema escuro com paisagem noturna e tema claro com paisagem diurna, ambos escolhidos nas configurações e salvos no perfil.
- Painel Pexlora AI com conteúdo explicativo mesmo enquanto o serviço de IA não está conectado; o painel pode ser fechado normalmente.
- As permissões de sites são negadas por padrão sem abrir janelas inesperadas do Windows.
