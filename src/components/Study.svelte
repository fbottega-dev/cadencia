<script lang="ts">
  import type { Card, Deck, Rating } from '../lib/domain';
  import { scheduleCard } from '../lib/domain';
  import Icon from './Icon.svelte';
  let {
    cards,
    decks,
    date,
    onreview,
    onclose,
  }: {
    cards: Card[];
    decks: Deck[];
    date: string;
    onreview: (id: string, rating: Rating) => Promise<void>;
    onclose: () => void;
  } = $props();
  let position = $state(0);
  let revealed = $state(false);
  let busy = $state(false);
  let error = $state('');
  let current = $derived(cards[position]);
  let deck = $derived(decks.find((d) => d.id === current?.deckId));
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(
      new Date(`${value}T12:00:00`),
    );
  async function rate(rating: Rating) {
    if (!current || busy || !revealed) return;
    busy = true;
    error = '';
    try {
      await onreview(current.id, rating);
      position += 1;
      revealed = false;
    } catch (e) {
      error =
        e instanceof Error ? e.message : 'Não foi possível salvar a revisão.';
    } finally {
      busy = false;
    }
  }
</script>

<section class="study-layout" aria-label="Sessão de estudo">
  <div class="study-toolbar">
    <button class="text-button" onclick={onclose} disabled={busy}
      ><Icon name="back" size={17} /> Encerrar sessão</button
    ><span class="small muted"
      >{Math.min(position + 1, cards.length)} de {cards.length}
      {cards.length === 1 ? 'cartão' : 'cartões'}</span
    >
  </div>
  <progress
    max={cards.length || 1}
    value={position}
    aria-label="Progresso da sessão"
  ></progress>
  {#if current}
    <div class="study-context">
      <span class="eyebrow">UM CARTÃO DE CADA VEZ</span>
      <h1>Espaço para lembrar.</h1>
      <p class="muted">Pense na resposta antes de virar o cartão.</p>
    </div>
    <article class="flashcard">
      <span class="pill {deck?.color}"
        ><Icon name="cards" size={15} /> <span>{deck?.name}</span></span
      >
      <p class="eyebrow question-label">PERGUNTA</p>
      <h2>{current.front}</h2>
      {#if revealed}
        <div class="answer" aria-live="polite">
          <span class="eyebrow">RESPOSTA</span>
          <p>{current.back}</p>
        </div>
      {:else}
        <button class="button primary reveal" onclick={() => (revealed = true)}
          >Revelar resposta <Icon name="arrow" size={18} /></button
        >
      {/if}
    </article>
    {#if revealed}
      <div class="review-options">
        <p>Como foi lembrar?</p>
        <div class="rating-buttons">
          <button
            class="rating again"
            disabled={busy}
            onclick={() => rate('again')}
            ><strong>Preciso rever</strong><span>Amanhã</span></button
          >
          <button
            class="rating good"
            disabled={busy}
            onclick={() => rate('good')}
            ><strong>Lembrei</strong><span
              >{dateLabel(scheduleCard(current, 'good', date).dueOn)}</span
            ></button
          >
          <button
            class="rating easy"
            disabled={busy}
            onclick={() => rate('easy')}
            ><strong>Com facilidade</strong><span
              >{dateLabel(scheduleCard(current, 'easy', date).dueOn)}</span
            ></button
          >
        </div>
        <span class="small muted"
          >{busy
            ? 'Salvando sua revisão…'
            : 'Sua escolha define a próxima revisão deste cartão.'}</span
        >
      </div>
    {/if}
    {#if error}<p class="form-error" role="alert">{error}</p>{/if}
  {:else}
    <div class="session-complete">
      <span class="complete-icon"><Icon name="check" size={38} /></span><span
        class="eyebrow">UM PASSO A MAIS</span
      >
      <h1>Por hoje, missão cumprida.</h1>
      <p>
        Você revisou {cards.length}
        {cards.length === 1 ? 'cartão' : 'cartões'}.<br />{cards.length === 1
          ? 'A próxima revisão já está agendada.'
          : 'As próximas revisões já estão agendadas.'}
      </p>
      <button class="button primary" onclick={onclose}
        >Voltar ao meu dia <Icon name="arrow" size={18} /></button
      >
    </div>
  {/if}
</section>
