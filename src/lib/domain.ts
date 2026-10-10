/** Regras locais de revisão: datas representam dias do calendário, sem horário. */
export type Rating = 'again' | 'good' | 'easy';
export type DeckColor = 'sage' | 'clay' | 'blue';

export interface Deck {
  id: string;
  name: string;
  description: string;
  color: DeckColor;
}

export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  box: number;
  dueOn: string;
  createdOn: string;
}

export interface Review {
  id: string;
  cardId: string;
  deckId: string;
  reviewedOn: string;
  rating: Rating;
  fromBox: number;
  toBox: number;
}

export interface State {
  schemaVersion: 1;
  decks: Deck[];
  cards: Card[];
  reviews: Review[];
  revision: number;
}

const INTERVALS = [0, 1, 3, 7, 14, 30] as const;
const COLORS: readonly DeckColor[] = ['sage', 'clay', 'blue'];
const RATINGS: readonly Rating[] = ['again', 'good', 'easy'];

export function makeId(): string {
  return globalThis.crypto.randomUUID();
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function requireDate(value: unknown, label = 'Data'): string {
  if (!isDateKey(value)) throw new Error(`${label} deve ser uma data válida entre 0001 e 9999.`);
  return value;
}

/** Usa o dia local da pessoa, sem converter o instante atual para UTC. */
export function todayKey(now = new Date()): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('Data atual inválida.');
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return requireDate(`${year}-${month}-${day}`);
}

/** Soma dias em UTC para que a duração do horário de verão não mude o calendário. */
export function addDays(date: string, days: number): string {
  requireDate(date);
  if (!Number.isSafeInteger(days)) throw new Error('O intervalo deve ser um número inteiro de dias.');
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(0);
  // Date.UTC(1, ...) interpretaria o ano 0001 como 1901.
  result.setUTCFullYear(year, month - 1, day);
  result.setUTCDate(result.getUTCDate() + days);
  if (Number.isNaN(result.getTime()) || result.getUTCFullYear() < 1 || result.getUTCFullYear() > 9999) {
    throw new Error('A próxima revisão ficou fora do calendário suportado.');
  }
  return result.toISOString().slice(0, 10);
}

function requireBox(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5) {
    throw new Error('O estágio de revisão deve estar entre 0 e 5.');
  }
  return value;
}

function requireRating(value: unknown): Rating {
  if (typeof value !== 'string' || !RATINGS.includes(value as Rating)) {
    throw new Error('Escolha uma avaliação de revisão válida.');
  }
  return value as Rating;
}

function nextBox(box: number, rating: Rating): number {
  requireBox(box);
  requireRating(rating);
  return rating === 'again' ? 0 : Math.min(5, box + (rating === 'easy' ? 2 : 1));
}

/** Atrasados primeiro; a ordenação não modifica a coleção original. */
export function dueCards(state: State, date: string, deckId?: string): Card[] {
  requireDate(date);
  return state.cards
    .filter((card) => card.dueOn <= date && (deckId === undefined || card.deckId === deckId))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.createdOn.localeCompare(b.createdOn) || a.id.localeCompare(b.id));
}

export function scheduleCard(card: Card, rating: Rating, date: string): Card {
  requireDate(date);
  requireDate(card.createdOn, 'Data de criação');
  if (date < card.createdOn) throw new Error('A revisão não pode acontecer antes da criação do cartão.');
  const box = nextBox(card.box, rating);
  const interval = rating === 'again' ? 1 : INTERVALS[box];
  return { ...card, box, dueOn: addDays(date, interval) };
}

export function reviewCard(state: State, cardId: string, rating: Rating, date: string): State {
  requireDate(date);
  requireRating(rating);
  const card = state.cards.find((item) => item.id === cardId);
  if (!card) throw new Error('Cartão não encontrado.');
  if (card.dueOn > date) throw new Error('Este cartão ainda não está disponível para revisão.');
  if (state.reviews.some((item) => item.cardId === cardId && item.reviewedOn === date)) {
    throw new Error('Este cartão já foi revisado neste dia.');
  }
  if (state.reviews.length >= 20_000) throw new Error('O limite de 20.000 revisões deste acervo foi atingido.');
  if (!Number.isSafeInteger(state.revision) || state.revision < 0 || state.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('A versão do acervo não pode ser incrementada.');
  }
  const updated = scheduleCard(card, rating, date);
  const review: Review = {
    id: makeId(), cardId: card.id, deckId: card.deckId, reviewedOn: date,
    rating, fromBox: card.box, toBox: updated.box,
  };
  return {
    ...state,
    cards: state.cards.map((item) => item.id === cardId ? updated : item),
    reviews: [...state.reviews, review],
    revision: state.revision + 1,
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} inválido.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number, optional = false): string {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) {
    throw new Error(`${label} deve conter ${optional ? 'até' : 'entre 1 e'} ${max} caracteres.`);
  }
  return value;
}

function id(value: unknown): string {
  const result = text(value, 'Identificador', 100);
  if (result.trim() !== result || /[\u0000-\u001f\u007f]/.test(result)) throw new Error('Identificador inválido.');
  return result;
}

function list(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label}: limite de ${max} itens.`);
  return value;
}

function unique<T extends { id: string }>(items: T[], label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    if (result.has(item.id)) throw new Error(`${label} contém identificadores repetidos.`);
    result.set(item.id, item);
  }
  return result;
}

/** Valida a importação e devolve dados novos; não confia em propriedades extras do JSON. */
export function validateState(input: unknown): State {
  const root = record(input, 'Acervo');
  if (root.schemaVersion !== 1) throw new Error('Formato de acervo não suportado.');
  if (typeof root.revision !== 'number' || !Number.isSafeInteger(root.revision) || root.revision < 0) {
    throw new Error('Versão do acervo inválida.');
  }

  const decks: Deck[] = list(root.decks, 'Coleções', 100).map((value) => {
    const item = record(value, 'Coleção');
    if (!COLORS.includes(item.color as DeckColor)) throw new Error('Cor de coleção inválida.');
    return {
      id: id(item.id), name: text(item.name, 'Nome da coleção', 60),
      description: text(item.description, 'Descrição da coleção', 180, true), color: item.color as DeckColor,
    };
  });
  const decksById = unique(decks, 'Coleções');

  const cards: Card[] = list(root.cards, 'Cartões', 5_000).map((value) => {
    const item = record(value, 'Cartão');
    const card: Card = {
      id: id(item.id), deckId: id(item.deckId), front: text(item.front, 'Frente do cartão', 300),
      back: text(item.back, 'Resposta do cartão', 2_000), box: requireBox(item.box),
      dueOn: requireDate(item.dueOn, 'Data da próxima revisão'), createdOn: requireDate(item.createdOn, 'Data de criação'),
    };
    if (!decksById.has(card.deckId)) throw new Error('Um cartão aponta para uma coleção inexistente.');
    if (card.dueOn < card.createdOn) throw new Error('Um cartão está agendado antes de sua criação.');
    return card;
  });
  const cardsById = unique(cards, 'Cartões');

  const reviews: Review[] = list(root.reviews, 'Revisões', 20_000).map((value) => {
    const item = record(value, 'Revisão');
    const review: Review = {
      id: id(item.id), cardId: id(item.cardId), deckId: id(item.deckId),
      reviewedOn: requireDate(item.reviewedOn, 'Data de revisão'), rating: requireRating(item.rating),
      fromBox: requireBox(item.fromBox), toBox: requireBox(item.toBox),
    };
    const card = cardsById.get(review.cardId);
    if (!card || card.deckId !== review.deckId) throw new Error('Uma revisão aponta para cartão ou coleção inexistente.');
    if (review.reviewedOn < card.createdOn) throw new Error('Uma revisão ocorreu antes da criação do cartão.');
    if (review.toBox !== nextBox(review.fromBox, review.rating)) throw new Error('Uma revisão contém uma mudança de estágio inválida.');
    return review;
  });
  unique(reviews, 'Revisões');
  const reviewsByCard = new Map<string, Review[]>();
  for (const review of reviews) {
    const history = reviewsByCard.get(review.cardId) ?? [];
    history.push(review);
    reviewsByCard.set(review.cardId, history);
  }
  for (const [cardId, history] of reviewsByCard) {
    // O arquivo pode ordenar o histórico livremente; a sequência real é por dia.
    history.sort((a, b) => a.reviewedOn.localeCompare(b.reviewedOn));
    let previous: Review | undefined;
    let scheduledDue: string | undefined;
    for (const review of history) {
      if (previous) {
        if (review.reviewedOn === previous.reviewedOn) throw new Error('Um cartão foi revisado mais de uma vez no mesmo dia.');
        if (review.fromBox !== previous.toBox) throw new Error('O histórico de um cartão possui estágios sem continuidade.');
        if (review.reviewedOn < scheduledDue!) throw new Error('Uma revisão ocorreu antes da data prevista pelo histórico.');
      }
      scheduledDue = addDays(review.reviewedOn, review.rating === 'again' ? 1 : INTERVALS[review.toBox]);
      previous = review;
    }
    const card = cardsById.get(cardId)!;
    if (card.box !== previous!.toBox || card.dueOn !== scheduledDue) {
      throw new Error('A agenda de um cartão não corresponde à sua última revisão.');
    }
  }

  return { schemaVersion: 1, decks, cards, reviews, revision: root.revision };
}

/** Exemplo transparente: cartões prontos para explorar, sem estatísticas de uso inventadas. */
export function createDemoState(date = todayKey()): State {
  requireDate(date);
  const decks: Deck[] = [
    { id: 'demo-javascript', name: 'JavaScript essencial', description: 'Conceitos que deixam o código mais claro.', color: 'sage' },
    { id: 'demo-http', name: 'A linguagem da web', description: 'HTTP, APIs e o caminho de uma requisição.', color: 'blue' },
    { id: 'demo-git', name: 'Git no dia a dia', description: 'Pequenas decisões para trabalhar com confiança.', color: 'clay' },
  ];
  const examples: [number, string, string, number, number][] = [
    [0, 'Qual é a diferença entre let e const?', 'let permite reatribuir a variável. const impede a reatribuição, mas não torna imutáveis os objetos ou arrays referenciados.', 0, -3],
    [0, 'O que Array.map devolve?', 'Um novo array com o resultado da função aplicada a cada elemento. O método não altera o array original por conta própria.', 0, 0],
    [0, 'O que uma Promise representa?', 'O resultado futuro de uma operação. Ela começa pendente e pode ser resolvida com um valor ou rejeitada com um motivo.', 1, -1],
    [0, 'Quando usar === em vez de ==?', 'Use === para comparar sem conversão implícita de tipos. Por exemplo, 0 === "0" é false, enquanto 0 == "0" é true.', 2, 2],
    [1, 'O que significa uma resposta HTTP 404?', 'O servidor não encontrou uma representação do recurso solicitado. A conexão pode ter funcionado normalmente.', 0, 0],
    [1, 'Qual é a diferença entre autenticação e autorização?', 'Autenticação verifica quem é a pessoa. Autorização decide quais ações ela pode executar sobre cada recurso.', 1, -2],
    [1, 'O que significa uma operação idempotente?', 'Repetir a mesma operação tem o mesmo efeito pretendido no servidor que executá-la uma única vez. A resposta pode mudar entre chamadas.', 0, 0],
    [1, 'Para que serve o cabeçalho Content-Type?', 'Indica o tipo de mídia do conteúdo enviado, como application/json. Pode aparecer tanto na requisição quanto na resposta.', 2, 4],
    [2, 'Qual é a diferença entre git fetch e git pull?', 'fetch atualiza as referências remotas sem integrar mudanças à branch atual. pull busca e depois integra, por merge ou rebase conforme a configuração.', 0, 0],
    [2, 'O que entra em um commit?', 'O conteúdo preparado na área de stage. Use git diff --staged para conferir exatamente o que será registrado.', 1, -4],
    [2, 'Por que criar uma branch para uma mudança?', 'Para desenvolver e revisar uma linha de trabalho separada. Depois, a mudança pode ser integrada à branch principal.', 1, 1],
    [2, 'O .gitignore remove arquivos já rastreados?', 'Não. Ele evita que arquivos não rastreados correspondentes sejam adicionados normalmente. Arquivos já rastreados continuam no histórico e no controle do Git.', 3, 7],
  ];
  const cards = examples.map(([deck, front, back, box, offset], index): Card => ({
    id: `demo-card-${index + 1}`, deckId: decks[deck].id, front, back, box,
    dueOn: addDays(date, offset), createdOn: addDays(date, -14),
  }));
  return { schemaVersion: 1, decks, cards, reviews: [], revision: 0 };
}
