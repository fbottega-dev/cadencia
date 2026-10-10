# Guia de estudo

O Cadência combina uma interface pequena com problemas úteis para aprender: estado reativo, datas, persistência assíncrona, validação de dados externos e funcionamento offline. Leia uma ação completa antes de tentar compreender todos os arquivos.

## Comece por uma revisão

1. Execute o projeto, entre em uma sessão e revele a resposta de um cartão.
2. Avalie sua recordação e observe a mudança na fila e no progresso.
3. Localize em `src/components/Study.svelte` o evento disparado pelo botão de avaliação e acompanhe seu callback em `src/App.svelte`.
4. Acompanhe a chamada à regra de domínio: ela calcula a nova caixa, a data de retorno e o registro da revisão.
5. Acompanhe a gravação em IndexedDB e a atualização do estado da interface.
6. Recarregue a página para verificar que a coleção vem do banco, não apenas da memória do componente.

Esse fluxo ajuda a distinguir **interação**, **regra de negócio** e **armazenamento**.

## Mapa de leitura

| Arquivo ou área      | O que procurar                                                 |
| -------------------- | -------------------------------------------------------------- |
| `package.json`       | Scripts, requisitos e dependências                             |
| `src/main.ts`        | Montagem do aplicativo, estilos e registro do service worker   |
| `src/App.svelte`     | Navegação, formulários, sessão de estudo e estado da interface |
| `src/components/`    | Cartão de estudo, editores, diálogo e ícones reutilizados      |
| `src/app.css`        | Tokens visuais, layouts e adaptação para telas menores         |
| `src/lib/domain.ts`  | Tipos, datas locais, caixas e cálculos da revisão              |
| `src/lib/storage.ts` | Banco local, validação de dados e proteção contra conflitos    |
| `src/**/*.test.ts`   | Exemplos executáveis das regras e casos de falha               |
| `public/sw.js`       | Instalação, cache e respostas offline                          |
| `vite.config.ts`     | Configuração da compilação e descoberta dos testes             |

## TypeScript: contrato não é validação

Os tipos descrevem o que as funções esperam e retornam. Uniões como `again | good | easy` restringem as avaliações possíveis no código. Tipos de cartão e baralho deixam explícitas as relações entre os dados.

Um arquivo JSON, entretanto, chega como dado desconhecido. Fazer uma conversão de tipo não verifica se o cartão tem frente, se o baralho existe ou se a data é válida. Observe os validadores de armazenamento e importação: eles devem rejeitar entradas inválidas antes de alterar a coleção. Estude tipos, funções e narrowing no [Handbook oficial do TypeScript](https://www.typescriptlang.org/docs/handbook/intro.html).

**Exercício:** invente um backup com um cartão apontando para um baralho inexistente. Escreva primeiro a expectativa de rejeição e depois execute o teste. Use uma cópia dos dados para experimentar.

## Svelte: estado e valores derivados

Componentes Svelte aproximam marcação, comportamento e estilos. Nas runes do Svelte 5, `$state` representa estado reativo e `$derived` representa um valor calculado a partir dele. A documentação de [Svelte](https://svelte.dev/docs/svelte/overview) é a referência para componentes e runes.

No aplicativo, procure distinguir a coleção salva do estado transitório: tela ativa, busca, formulário aberto e resposta revelada. Contagens e listas filtradas devem acompanhar os dados de origem. Observe também o uso de rótulos, elementos `button` e feedback de erro; esses detalhes fazem parte do comportamento da interface.

**Exercício:** acompanhe uma busca sem criar uma segunda cópia persistida dos cartões filtrados. Explique por que o filtro pode ser derivado da coleção e do texto de busca.

## Funções puras e datas

Uma função de domínio deve poder receber um cartão, uma avaliação e uma data conhecida e produzir um resultado previsível. Ela não precisa abrir IndexedDB nem renderizar uma tela. Isso permite testar transições de caixa, limites e viradas de mês com entradas explícitas.

O algoritmo utiliza dias do calendário local. “Amanhã” significa o próximo dia desse calendário; não presuma que todo dia local equivale a exatamente 24 horas. Datas, fuso do dispositivo e mudança de mês merecem atenção ao alterar essas funções.

**Exercício:** calcule à mão o retorno de um cartão na caixa 4 avaliado como “Com facilidade” e compare com o teste. Depois faça o mesmo para “Preciso rever”. O teto é a caixa 5, e “Preciso rever” volta amanhã na caixa 0.

## IndexedDB: persistência e transações

IndexedDB é uma API assíncrona para armazenar dados estruturados no navegador. A leitura e a gravação usam transações, e o armazenamento é separado por origem. Consulte a [documentação da API no MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

Leia o que acontece quando uma transação falha: a interface deve comunicar o problema sem anunciar uma gravação bem-sucedida. Confira também a comparação de revisão entre a versão carregada e a versão atual do banco. Essa comparação evita que uma aba antiga sobrescreva os dados que outra acabou de salvar.

O backup é uma representação transportável da coleção, não um banco remoto. A importação valida o conjunto inteiro e, após confirmação, substitui o conjunto atual. Ao evoluir o formato, pense em migração e compatibilidade antes de mudar os campos.

**Exercício:** abra duas abas, altere a coleção em uma e tente salvar a versão antiga na outra. Observe o tratamento do conflito. Exporte um backup antes da experiência se houver cartões pessoais.

## Service worker: o que fica offline

O service worker pode interceptar solicitações dentro do seu escopo e responder usando cache. Ele exige um contexto seguro, como HTTPS, com a exceção de desenvolvimento em localhost. Consulte a [documentação de service workers no MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).

No Cadência ele atende aos arquivos da aplicação; IndexedDB atende aos cartões. O registro acontece na compilação de produção. Inspecione `public/sw.js`, a versão do cache e o que é feito na instalação, ativação e busca de recursos. Uma atualização do aplicativo precisa respeitar tanto arquivos antigos em cache quanto dados existentes no banco.

**Exercício:** rode `npm run build` e `npm run preview`, carregue o site e confirme a ativação do worker nas ferramentas do navegador. Desative a rede e recarregue. Depois reative a rede e confira como uma nova compilação chega ao navegador.

## Testar e explicar

O [Vite](https://vite.dev/guide/) serve o projeto durante o desenvolvimento e gera a distribuição. O [Vitest](https://vitest.dev/guide/) executa os testes. Comece pelos testes do domínio: leia a entrada, faça uma previsão e compare com a expectativa.

Antes de apresentar o projeto, procure explicar com suas palavras:

- Por que os cartões não aparecem automaticamente em outro navegador.
- Como cada avaliação altera o próximo dia de revisão.
- Por que TypeScript e validação em tempo de execução são complementares.
- Como o aplicativo reage a uma falha de gravação e a duas abas concorrentes.
- Por que o cache offline não protege contra perda do banco local.

O projeto teve apoio de IA. A melhor forma de transformá-lo em aprendizado é reproduzir os fluxos, ler os testes e fazer mudanças pequenas que você consiga justificar. Registre evidências reais em [Validação](VALIDACAO.md) e escolha uma melhoria de cada vez em [Evolução](EVOLUCAO.md).
