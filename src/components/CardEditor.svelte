<script lang="ts">
  import { untrack } from 'svelte';
  import type { Card, Deck } from '../lib/domain';
  import Dialog from './Dialog.svelte';
  let {
    card,
    decks,
    initialDeckId,
    onsave,
    onclose,
  }: {
    card?: Card;
    decks: Deck[];
    initialDeckId: string;
    onsave: (data: Pick<Card, 'front' | 'back' | 'deckId'>) => Promise<void>;
    onclose: () => void;
  } = $props();
  let deckId = $state(untrack(() => card?.deckId ?? initialDeckId));
  let front = $state(untrack(() => card?.front ?? ''));
  let back = $state(untrack(() => card?.back ?? ''));
  let saving = $state(false);
  let error = $state('');
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!front.trim() || !back.trim()) {
      error = 'Preencha a pergunta e a resposta.';
      return;
    }
    saving = true;
    try {
      await onsave({ deckId, front: front.trim(), back: back.trim() });
      onclose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Não foi possível salvar.';
    } finally {
      saving = false;
    }
  }
</script>

<Dialog
  title={card ? 'Editar cartão' : 'Uma ideia, um cartão'}
  onclose={() => {
    if (!saving) onclose();
  }}
>
  <form onsubmit={submit} class="editor-form">
    <p class="muted">Uma pergunta objetiva ajuda você a lembrar da resposta.</p>
    <label
      >Baralho<select bind:value={deckId} disabled={!!card}
        >{#each decks as deck}<option value={deck.id}>{deck.name}</option
          >{/each}</select
      ></label
    >
    <label
      >Pergunta<textarea
        bind:value={front}
        maxlength="300"
        rows="3"
        required
        placeholder="O que você quer lembrar?"></textarea><span
        class="field-note">{front.length}/300</span
      ></label
    >
    <label
      >Resposta<textarea
        bind:value={back}
        maxlength="2000"
        rows="5"
        required
        placeholder="Explique com suas próprias palavras."></textarea><span
        class="field-note">{back.length}/2000 · texto simples</span
      ></label
    >
    {#if card}<p class="small muted">
        Editar o conteúdo preserva a data da próxima revisão.
      </p>{/if}
    {#if error}<p class="form-error" role="alert">{error}</p>{/if}
    <div class="dialog-actions">
      <button
        class="button secondary"
        type="button"
        disabled={saving}
        onclick={onclose}>Cancelar</button
      ><button class="button primary" disabled={saving}
        >{saving ? 'Salvando…' : 'Salvar cartão'}</button
      >
    </div>
  </form>
</Dialog>
