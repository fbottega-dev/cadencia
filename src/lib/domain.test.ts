import { describe, expect, it } from 'vitest';
import {
  addDays, createDemoState, dueCards, isDateKey, reviewCard, scheduleCard, todayKey, validateState,
  type Card, type Rating, type State,
} from './domain';

const DATE = '2026-10-09';

function card(patch: Partial<Card> = {}): Card {
  return { id: 'card-1', deckId: 'deck-1', front: 'Pergunta?', back: 'Resposta.', box: 0, dueOn: DATE, createdOn: '2026-09-01', ...patch };
}

function state(patch: Partial<State> = {}): State {
  return {
    schemaVersion: 1, revision: 0,
    decks: [{ id: 'deck-1', name: 'Minha coleção', description: '', color: 'sage' }],
    cards: [card()], reviews: [], ...patch,
  };
}

describe('datas de calendário', () => {
  it.each(['0001-01-01', '2024-02-29', '2000-02-29', '9999-12-31'])('aceita a data real %s', (value) => {
    expect(isDateKey(value)).toBe(true);
  });

  it.each(['0000-01-01', '1900-02-29', '2023-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-01', '2026-01-01T00:00:00Z', '', null, 20261009])('recusa a data inválida %s', (value) => {
    expect(isDateKey(value)).toBe(false);
  });

  it('usa o dia local fornecido e não altera a data original', () => {
    const now = new Date(2026, 9, 9, 23, 59, 0);
    const original = now.getTime();
    expect(todayKey(now)).toBe(DATE);
    expect(now.getTime()).toBe(original);
    expect(() => todayKey(new Date('inválida'))).toThrow();
  });

  it.each([
    ['2024-02-28', 1, '2024-02-29'], ['2024-02-29', 1, '2024-03-01'],
    ['2023-02-28', 1, '2023-03-01'], ['2026-12-31', 1, '2027-01-01'],
    ['2026-01-01', -1, '2025-12-31'], ['0001-01-01', 1, '0001-01-02'],
    ['2026-03-07', 2, '2026-03-09'], ['2026-11-01', 1, '2026-11-02'],
  ])('soma dias: %s + %i = %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });

  it('recusa datas, intervalos e resultados fora dos limites', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow();
    expect(() => addDays(DATE, 0.5)).toThrow();
    expect(() => addDays(DATE, Infinity)).toThrow();
    expect(() => addDays('0001-01-01', -1)).toThrow();
    expect(() => addDays('9999-12-31', 1)).toThrow();
  });
});

describe('agenda de revisão', () => {
  it.each([
    [0, 'again', 0, 1], [5, 'again', 0, 1],
    [0, 'good', 1, 1], [1, 'good', 2, 3], [2, 'good', 3, 7],
    [3, 'good', 4, 14], [4, 'good', 5, 30], [5, 'good', 5, 30],
    [0, 'easy', 2, 3], [1, 'easy', 3, 7], [2, 'easy', 4, 14],
    [3, 'easy', 5, 30], [4, 'easy', 5, 30], [5, 'easy', 5, 30],
  ] as [number, Rating, number, number][])('estágio %i, %s → estágio %i em %i dias', (box, rating, expectedBox, days) => {
    const original = Object.freeze(card({ box, dueOn: '2026-10-01' }));
    const updated = scheduleCard(original, rating, DATE);
    expect(updated.box).toBe(expectedBox);
    expect(updated.dueOn).toBe(addDays(DATE, days));
    expect(updated.id).toBe(original.id);
    expect(original.dueOn).toBe('2026-10-01');
    expect(updated).not.toBe(original);
  });

  it('recusa avaliação inválida, estágio inválido e revisão anterior à criação', () => {
    expect(() => scheduleCard(card(), 'invalid' as Rating, DATE)).toThrow();
    expect(() => scheduleCard(card({ box: 6 }), 'good', DATE)).toThrow();
    expect(() => scheduleCard(card({ createdOn: '2026-10-10' }), 'good', DATE)).toThrow();
  });

  it('seleciona somente vencidos/hoje, filtra coleção e ordena sem mudar o estado', () => {
    const input = state({ cards: [
      card({ id: 'today' }), card({ id: 'future', dueOn: '2026-10-10' }),
      card({ id: 'older', dueOn: '2026-10-01' }), card({ id: 'other', deckId: 'deck-2', dueOn: '2026-10-02' }),
    ] });
    const original = structuredClone(input);
    expect(dueCards(input, DATE).map((item) => item.id)).toEqual(['older', 'other', 'today']);
    expect(dueCards(input, DATE, 'deck-1').map((item) => item.id)).toEqual(['older', 'today']);
    expect(dueCards(input, DATE, 'missing')).toEqual([]);
    expect(input).toEqual(original);
  });

  it('registra uma revisão e remove o cartão da fila de hoje', () => {
    const input = state();
    const original = structuredClone(input);
    const result = reviewCard(input, 'card-1', 'good', DATE);
    expect(result.revision).toBe(1);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0]).toMatchObject({ cardId: 'card-1', deckId: 'deck-1', reviewedOn: DATE, rating: 'good', fromBox: 0, toBox: 1 });
    expect(result.reviews[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(dueCards(result, DATE)).toEqual([]);
    expect(input).toEqual(original);
    expect(() => reviewCard(result, 'card-1', 'easy', DATE)).toThrow(/ainda não/);
    expect(reviewCard(result, 'card-1', 'easy', '2026-10-10').cards[0].box).toBe(3);
  });

  it('recusa cartão inexistente ou futuro sem criar histórico', () => {
    const input = state({ cards: [card({ dueOn: '2026-10-10' })] });
    expect(() => reviewCard(input, 'missing', 'good', DATE)).toThrow(/não encontrado/);
    expect(() => reviewCard(input, 'card-1', 'good', DATE)).toThrow(/ainda não/);
    expect(input.reviews).toEqual([]);
  });

  it('não duplica a revisão do dia mesmo se um arquivo importado antecipar a agenda', () => {
    const input = reviewCard(state(), 'card-1', 'good', DATE);
    input.cards[0].dueOn = DATE;
    expect(() => reviewCard(input, 'card-1', 'easy', DATE)).toThrow(/já foi revisado/);
    expect(input.reviews).toHaveLength(1);
  });

  it('não ultrapassa os limites do histórico ou do contador', () => {
    const one = { ...reviewCard(state(), 'card-1', 'good', DATE).reviews[0], reviewedOn: '2026-10-08' };
    expect(() => reviewCard(state({ reviews: Array(20_000).fill(one) }), 'card-1', 'good', DATE)).toThrow(/limite/);
    expect(() => reviewCard(state({ revision: Number.MAX_SAFE_INTEGER }), 'card-1', 'good', DATE)).toThrow(/incrementada/);
  });
});

describe('importação e integridade do acervo', () => {
  it('copia dados válidos sem preservar propriedades desconhecidas ou referências', () => {
    const input = { ...state(), extra: 'ignorar' };
    const result = validateState(input);
    expect(result).toEqual(state());
    result.cards[0].front = 'Alterada';
    result.decks[0].name = 'Alterada';
    expect(input.cards[0].front).toBe('Pergunta?');
    expect(input.decks[0].name).toBe('Minha coleção');
  });

  it('aceita um acervo vazio e um histórico produzido pelas próprias regras', () => {
    expect(validateState(state({ decks: [], cards: [] })).cards).toEqual([]);
    const result = reviewCard(state(), 'card-1', 'easy', DATE);
    expect(validateState(result)).toEqual(result);
  });

  it.each([null, [], 'texto', {}, { ...state(), schemaVersion: 2 }, { ...state(), revision: -1 }, { ...state(), revision: 0.5 }, { ...state(), revision: Number.MAX_SAFE_INTEGER + 1 }])('recusa raiz/versão inválida %#', (input) => {
    expect(() => validateState(input)).toThrow();
  });

  it('rejeita nomes e textos vazios ou acima do limite; aceita as fronteiras', () => {
    const input = state();
    input.decks[0].name = 'n'.repeat(60);
    input.decks[0].description = 'd'.repeat(180);
    input.cards[0].front = 'f'.repeat(300);
    input.cards[0].back = 'b'.repeat(2_000);
    expect(validateState(input)).toEqual(input);
    for (const [group, key, value] of [
      ['decks', 'name', ' '], ['decks', 'name', 'n'.repeat(61)],
      ['decks', 'description', 'd'.repeat(181)], ['cards', 'front', 'f'.repeat(301)],
      ['cards', 'back', 'b'.repeat(2_001)], ['cards', 'back', '\n\t'],
    ] as const) {
      const invalid = structuredClone(input);
      Object.assign(invalid[group][0], { [key]: value });
      expect(() => validateState(invalid)).toThrow();
    }
  });

  it('rejeita coleções, cartões e revisões acima dos limites antes de percorrê-los', () => {
    expect(() => validateState(state({ decks: Array(101).fill(null) }))).toThrow(/100/);
    expect(() => validateState(state({ cards: Array(5_001).fill(null) }))).toThrow(/5000/);
    expect(() => validateState(state({ reviews: Array(20_001).fill(null) }))).toThrow(/20000/);
  });

  it('rejeita IDs repetidos, vazios e referências órfãs', () => {
    const input = state();
    expect(() => validateState(state({ decks: [...input.decks, ...input.decks] }))).toThrow(/repetidos/);
    expect(() => validateState(state({ cards: [card(), card()] }))).toThrow(/repetidos/);
    expect(() => validateState(state({ cards: [card({ id: '' })] }))).toThrow(/Identificador/);
    expect(() => validateState(state({ cards: [card({ id: ' bad ' })] }))).toThrow(/Identificador/);
    expect(() => validateState(state({ cards: [card({ deckId: 'missing' })] }))).toThrow(/inexistente/);
    const reviewed = reviewCard(input, 'card-1', 'good', DATE);
    expect(() => validateState({ ...reviewed, cards: [] })).toThrow(/inexistente/);
    expect(() => validateState({ ...reviewed, reviews: [...reviewed.reviews, ...reviewed.reviews] })).toThrow(/repetidos/);
  });

  it('rejeita cores, estágios e datas inconsistentes', () => {
    const input = state();
    expect(() => validateState({ ...input, decks: [{ ...input.decks[0], color: 'pink' }] })).toThrow(/Cor/);
    for (const invalid of [card({ box: -1 }), card({ box: 1.2 }), card({ box: 6 }), card({ dueOn: '2026-02-30' }), card({ createdOn: '2026-10-10' })]) {
      expect(() => validateState(state({ cards: [invalid] }))).toThrow();
    }
  });

  it('rejeita histórico com estágio, coleção, data ou repetição impossível', () => {
    const input = reviewCard(state(), 'card-1', 'good', DATE);
    for (const patch of [{ toBox: 4 }, { deckId: 'missing' }, { reviewedOn: '2026-08-31' }, { rating: 'unknown' }]) {
      const invalid = { ...input, reviews: [{ ...input.reviews[0], ...patch }] };
      expect(() => validateState(invalid)).toThrow();
    }
    const twice = { ...input, reviews: [...input.reviews, { ...input.reviews[0], id: 'second-review' }] };
    expect(() => validateState(twice)).toThrow(/mais de uma vez/);
  });

  it('rejeita um backup que recoloca na fila um cartão já revisado no dia', () => {
    const input = reviewCard(state(), 'card-1', 'good', DATE);
    input.cards[0].dueOn = DATE;
    expect(() => validateState(input)).toThrow(/agenda.*última revisão/);
  });

  it('rejeita estágio ou data atuais diferentes do resultado da última revisão', () => {
    const input = reviewCard(state(), 'card-1', 'easy', DATE);
    expect(() => validateState({ ...input, cards: [card({ box: 0, dueOn: '2026-10-12' })] })).toThrow(/agenda.*última revisão/);
    expect(() => validateState({ ...input, cards: [card({ box: 2, dueOn: '2026-10-13' })] })).toThrow(/agenda.*última revisão/);
  });

  it('aceita histórico fora de ordem no arquivo e preserva essa ordem na cópia', () => {
    const first = reviewCard(state(), 'card-1', 'good', DATE);
    const second = reviewCard(first, 'card-1', 'easy', '2026-10-10');
    const input = { ...second, reviews: [...second.reviews].reverse() };
    expect(validateState(input)).toEqual(input);
  });

  it('exige continuidade dos estágios entre revisões, mesmo com transições isoladas válidas', () => {
    const first = reviewCard(state(), 'card-1', 'good', DATE);
    const second = reviewCard(first, 'card-1', 'good', '2026-10-10');
    second.reviews[1] = { ...second.reviews[1], fromBox: 3, toBox: 4 };
    second.cards[0] = { ...second.cards[0], box: 4, dueOn: '2026-10-24' };
    expect(() => validateState(second)).toThrow(/sem continuidade/);
  });

  it('rejeita revisão antecipada, mesmo que o estado final corresponda ao último evento', () => {
    const first = reviewCard(state(), 'card-1', 'easy', DATE);
    const second = reviewCard(first, 'card-1', 'good', '2026-10-12');
    second.reviews[1].reviewedOn = '2026-10-10';
    second.cards[0].dueOn = '2026-10-17';
    expect(() => validateState(second)).toThrow(/antes da data prevista/);
  });

  it('aceita primeira revisão em estágio avançado e revisões atrasadas', () => {
    const first = reviewCard(state({ cards: [card({ box: 3 })] }), 'card-1', 'good', DATE);
    expect(validateState(first)).toEqual(first);
    const late = reviewCard(first, 'card-1', 'again', '2026-11-01');
    expect(late.cards[0].dueOn).toBe('2026-11-02');
    expect(validateState(late)).toEqual(late);
  });
});

describe('demonstração', () => {
  it('entrega três coleções, doze cartões, oito disponíveis e nenhum uso inventado', () => {
    const demo = createDemoState(DATE);
    expect(demo.decks).toHaveLength(3);
    expect(demo.cards).toHaveLength(12);
    expect(dueCards(demo, DATE)).toHaveLength(8);
    expect(demo.cards.filter((item) => item.dueOn > DATE)).toHaveLength(4);
    expect(demo.reviews).toEqual([]);
    expect(demo.revision).toBe(0);
    expect(validateState(demo)).toEqual(demo);
  });

  it('cria coleções independentes e respeita o dia escolhido', () => {
    const first = createDemoState(DATE);
    const second = createDemoState('2026-10-10');
    expect(second.cards[0].dueOn).toBe(addDays(first.cards[0].dueOn, 1));
    second.cards[0].front = 'Alterado';
    expect(first.cards[0].front).not.toBe('Alterado');
  });
});
