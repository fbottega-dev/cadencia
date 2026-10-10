# Instruções para continuar o Cadência

Trabalhe neste projeto existente. Antes de alterar o código, leia `README.md`, confira `git status`, examine os scripts de `package.json` e consulte os arquivos e testes da área afetada. Preserve alterações prévias do usuário. Não recrie a aplicação ou troque a stack como atalho para uma mudança pequena.

## Produto e arquitetura

- A interface e a documentação são em português brasileiro.
- A stack é Svelte 5, TypeScript, Vite e Vitest; os dados ficam em IndexedDB.
- Preserve a separação entre regras puras de revisão, persistência e interface.
- Use o estilo de runes já adotado nos componentes. Evite estados duplicados quando um valor puder ser derivado.
- Mantenha mensagens compreensíveis, rótulos de formulários, navegação por teclado e adaptação a telas estreitas.
- Não introduza login, analytics, serviços remotos ou dependências desnecessárias para atender a uma mudança local.

## Preservação dos dados

- Nunca resolva um erro de leitura apagando silenciosamente a coleção ou recriando exemplos.
- Mudanças no formato persistido precisam considerar versão, migração e backups existentes.
- Valide dados em tempo de execução nas fronteiras: JSON importado e leitura do armazenamento não são confiáveis apenas por terem tipos TypeScript.
- Preserve a gravação atômica, os limites de importação e a detecção de versões concorrentes entre abas.
- Uma operação que substitui ou exclui conteúdo deve explicar o efeito e manter a possibilidade de cancelar antes da execução.
- Cache do service worker e coleção IndexedDB são independentes. Atualizar arquivos offline não deve apagar dados de estudo.
- Ao mexer em datas, preserve a regra de calendário local e o retorno no dia seguinte após `again`.

## Verificação e documentação

Execute os testes relevantes à mudança. Para mudanças funcionais, rode `npm run check`, `npm test` e `npm run build`; verifique no navegador os fluxos visuais afetados. Mudanças apenas de texto pedem revisão de conteúdo e links, não testes artificiais. Altere ou acrescente testes quando isso proteger uma regra ou falha real.

Atualize a documentação quando comportamento, comandos, formato de backup ou requisitos mudarem. Registre em `docs/VALIDACAO.md` apenas verificações efetivamente realizadas, com limitações explícitas. Não invente cobertura, resultados, desempenho, usuários ou histórico de atividade.

Mantenha a atribuição honesta: este é um projeto de estudo desenvolvido com apoio de IA. Não alegue autoria inteiramente manual, experiência profissional ou eficácia de aprendizagem sem evidências.
