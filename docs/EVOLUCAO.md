# Evolução

O escopo atual é um aplicativo pessoal de cartões de texto com revisões diárias, persistência local e backup. As próximas mudanças devem partir desse fluxo funcionando. As prioridades abaixo são propostas de evolução, não recursos já disponíveis nem falhas deixadas de propósito.

## 1. Tornar o histórico mais explicável

Adicionar uma visão por baralho com dias de revisão, avaliações e distribuição das caixas. O usuário poderá compreender de onde vêm os números sem confundi-los com uma medida comprovada de aprendizagem.

**Critérios de conclusão:** números derivados exclusivamente das revisões salvas; estados vazios claros; filtros por período com datas locais; testes de agregação nas fronteiras do período; leitura acessível dos valores sem depender apenas de cor ou gráfico.

## 2. Importar conteúdo com prévia

Adicionar importação de cartões por CSV ou TSV para facilitar a migração de anotações. A tela deve mostrar as colunas reconhecidas, o baralho de destino e os erros antes de salvar, mantendo o backup JSON como formato da coleção completa.

**Critérios de conclusão:** prévia editável ou cancelável; suporte documentado a aspas, separadores e quebras de linha; aplicação dos mesmos limites dos cartões; gravação atômica; nenhum conteúdo substituído sem uma escolha explícita; testes com arquivos válidos e malformados.

## 3. Melhorar o controle do acervo local

Adicionar arquivamento de baralhos e um lembrete de backup baseado na última exportação. Um baralho arquivado sairá da fila sem apagar seu conteúdo e poderá ser restaurado.

**Critérios de conclusão:** migração versionada de coleções existentes; backups antigos continuam importáveis; revisões históricas preservadas; filtros claros para ativos e arquivados; aviso de backup sem exigir conta ou conexão; testes de migração e restauração.

## O que exige outra decisão de produto

Sincronização entre dispositivos, compartilhamento e colaboração mudariam a arquitetura: exigiriam definir identidade, conflitos, privacidade e operação de servidor. Um algoritmo adaptativo como FSRS também precisaria de estudo, requisitos e validação próprios. Essas ideias não fazem parte das três prioridades atuais.

Cada mudança deve atualizar a documentação do comportamento, incluir verificações proporcionais ao risco e registrar somente resultados realmente obtidos. O projeto foi desenvolvido com apoio de IA; contribuições futuras devem continuar explicáveis e revisáveis.
