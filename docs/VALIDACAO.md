# Validação da versão 1.0

Verificações realizadas em 10/10/2026. Projeto desenvolvido e revisado com apoio de IA; este registro separa testes automatizados de interação real no navegador.

## Ambiente

Windows, Node.js 24.19.0 e npm 11.17.0. Navegador integrado do Codex (Chromium), com interface inspecionada em 1440 × 1050 e 390 × 844 pixels. As capturas `preview.jpg` e `mobile.jpg` mostram a implementação real.

## Verificações locais

| Verificação            | Resultado observado                                                 |
| ---------------------- | ------------------------------------------------------------------- |
| `npm ci`               | Instalação reproduzível concluída                                   |
| `npm run check`        | Zero erros e zero avisos                                            |
| `npm test`             | 103 testes aprovados em 3 arquivos                                  |
| `npm run build`        | Build de produção concluído; 17 recursos incluídos no cache offline |
| `npm audit --omit=dev` | Nenhuma vulnerabilidade conhecida reportada na execução             |

A suíte reúne 69 testes de domínio, 20 de persistência e 14 de cache/build. Verifica datas, limites, transições, histórico consistente, importações inválidas, preservação de dados corrompidos, falta de espaço, duas gravações concorrentes e acesso offline. Os testes de IndexedDB usam `fake-indexeddb`; os testes do worker executam o código em uma VM com APIs simuladas. Eles complementam a verificação real descrita abaixo.

No Windows, a reinstalação inicialmente encontrou uma DLL do Vite em uso pelo preview. Encerrar o servidor liberou o arquivo e `npm ci` passou. O pool de testes foi configurado como `threads` para evitar uma falha de acesso ao cache temporário entre processos observada no sandbox Windows.

## Fluxos conferidos no navegador

- Coleção inicial com 3 baralhos, 12 cartões e zero revisões. Também foi confirmada a passagem de um dia para outro com a coleção persistida.
- Criação de baralho, escolha da cor e edição do nome.
- Criação e edição de cartão; busca pela resposta; estado vazio da busca e do baralho.
- Exibição literal de texto contendo `<script>`, sem execução de HTML.
- Revelação da resposta, avaliação, conclusão da sessão e atualização das contagens reais.
- Persistência de cartões, próxima data e histórico após recarregar.
- Cancelamento da exclusão e exclusão confirmada de um cartão de teste, incluindo seu histórico.
- Exportação de JSON para um arquivo real, abertura da prévia de importação, cancelamento e restauração confirmada em outra origem local.
- Layout de celular sem rolagem horizontal; diálogo, busca e estados vazios inspecionados visualmente.
- Acesso offline real: depois de instalar a versão corrigida, o servidor HTTP foi encerrado. A página recarregou pelo cache, revelou a resposta e gravou uma revisão no IndexedDB.

A concorrência entre abas, a rejeição de backups inválidos/excessivos e todos os intervalos de revisão foram verificados por testes automatizados. Não houve auditoria completa com leitor de tela nem execução em Safari, Firefox ou aparelho móvel físico.

## Correções confirmadas antes da publicação

Um backup podia conter histórico válido isoladamente e uma agenda incompatível com a última revisão. Isso recolocava um cartão na fila enquanto a regra impedia revisá-lo novamente. A importação agora verifica a continuidade do histórico e sua relação com a agenda atual; testes de regressão cobrem o caso.

O teste offline revelou uma página sem JavaScript depois de atualizações locais. O Vite enviava `Vary: Origin`, e a requisição de módulo não correspondia à entrada de precache. A leitura dos recursos estáticos conhecidos agora ignora essa variação. Além disso, a instalação força a atualização do cache HTTP e a navegação usa o HTML da mesma versão instalada. O teste real com o servidor desligado passou após a correção.

## Publicação

O workflow `.github/workflows/ci.yml` instala, verifica, testa e compila em Windows e Ubuntu. A publicação no GitHub Pages depende da aprovação dos dois ambientes. Consulte a [execução mais recente](https://github.com/fbottega-dev/cadencia/actions) para verificar o commit publicado.

## Limites conhecidos

- Dados pertencem ao navegador e à origem; não há sincronização entre dispositivos.
- Limpar os dados do site pode remover o acervo. O cache do aplicativo não substitui um backup dos cartões.
- O primeiro carregamento e a instalação completa do cache exigem conexão. Atualizações entram depois que as abas antigas são fechadas.
- Coleção e backup têm limite de 2 MiB; também há limites de 100 baralhos, 5.000 cartões e 20.000 revisões.
- O modelo de caixas é uma regra pedagógica simples. As estatísticas registram atividade e não comprovam aprendizagem.
