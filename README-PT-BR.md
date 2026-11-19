# Pexlora Browser — versão 0.1.0

Esta é a base desktop experimental do Pexlora Browser. Ela usa Electron e o Chromium distribuído com o Electron para renderizar páginas reais dentro das abas.

## Para quem só quer instalar

A versão pública deverá ser distribuída como um único arquivo: `Pexlora-Setup-0.1.0.exe`. Depois de baixá-lo, basta dar dois cliques e seguir o assistente. A pessoa que instala o navegador não precisa de Node.js nem do ZIP do código-fonte.

**O instalador ainda não foi compilado nem publicado.** Este repositório contém o projeto e a automação para gerar o instalador num runner Windows do GitHub Actions.

## O que funciona nesta versão

- Navegação real por endereços HTTP e HTTPS e pesquisa pelo motor escolhido.
- Abas independentes, nova guia, fechar e alternar abas.
- Voltar, avançar, recarregar e página inicial.
- Favoritos salvos no perfil local.
- Histórico local das páginas visitadas.
- Downloads em `Downloads\\Pexlora`, com status no gerenciador.
- Guias privadas com armazenamento de sessão temporário; o histórico da guia privada não é salvo pelo Pexlora e os dados da sessão são limpos quando todas as guias privadas são fechadas.
- Pexlora Shields com uma lista pequena de domínios de rastreamento conhecidos. É uma proteção básica, não um bloqueador completo.
- Pedidos de permissão de site exigem confirmação do usuário.
- Preferência entre Google e DuckDuckGo.
- Atalhos: `Ctrl+T`, `Ctrl+W`, `Ctrl+L`, `Ctrl+R`, `Ctrl+H`, `Ctrl+J`, `Ctrl+Shift+N`, `Alt+←` e `Alt+→`.

## O que ainda não está pronto

- **Pexlora AI:** o painel está presente, mas ainda não há um provedor de IA conectado. O botão de texto da página apenas mostra um trecho extraído localmente; não gera uma resposta por IA.
- **Pexlora Shields:** a lista atual é pequena e não oferece a cobertura de um navegador especializado em privacidade.
- Sincronização entre dispositivos, perfis, extensões, tradução integrada, preenchimento automático avançado, atualização automática e sistema próprio de contas ainda não foram implementados.
- Esta versão não é uma distribuição Chromium independente: usa o Chromium incorporado ao Electron.

## Desenvolvimento local (não é o processo para o usuário final)

1. Instale o Node.js LTS.
2. Extraia a pasta do projeto.
3. Execute `npm install` e depois `npm start`.

Para gerar manualmente o instalador em um Windows:

```powershell
npm install
npm run check
npm run dist:win
```

O instalador será criado na pasta `dist` com o nome `Pexlora-Setup-0.1.0.exe`.

## Publicação pública

O workflow `.github/workflows/build-windows-installer.yml` automatiza a compilação Windows. A cada envio para `main`, ele gera um instalador e o publica na versão de teste pública `latest`. Também é possível criar uma versão estável ao enviar uma tag `v*`. O público baixa somente o arquivo `.exe` na área Releases.

Um repositório público torna também o código-fonte público; para manter o código privado, publique o arquivo `.exe` separadamente num host público.

## Dados do usuário

O perfil do navegador fica na pasta de dados do Electron para o usuário atual. Downloads são salvos em `Downloads\\Pexlora`. O modo privado usa uma sessão separada e temporária.

## Segurança

As páginas externas são abertas em WebContents separados, com `nodeIntegration` desativado, `contextIsolation` ativado e sandbox habilitado. A interface nativa do Pexlora não expõe APIs Node às páginas navegadas. Permissões sensíveis são negadas até que a pessoa confirme.

Esta versão é experimental. Não use como seu único navegador para tarefas sensíveis nem assuma que o bloqueio básico de rastreadores garante anonimato ou proteção total.
