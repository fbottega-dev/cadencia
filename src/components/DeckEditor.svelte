<script lang="ts">
  import { untrack } from 'svelte';
  import type { Deck } from '../lib/domain';
  import Dialog from './Dialog.svelte';
  let {
    deck,
    onsave,
    onclose,
  }: {
    deck?: Deck;
    onsave: (data: Omit<Deck, 'id'>) => Promise<void>;
    onclose: () => void;
  } = $props();
  // Each dialog mounts once. Keep edits independent from incoming saved data.
  let name = $state(untrack(() => deck?.name ?? ''));
  let description = $state(untrack(() => deck?.description ?? ''));
  let color = $state<Deck['color']>(untrack(() => deck?.color ?? 'sage'));
  let saving = $state(false);
  let error = $state('');
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!name.trim()) {
      error = 'Dê um nome ao baralho.';
      return;
    }
    saving = true;
    try {
      await onsave({
        name: name.trim(),
        description: description.trim(),
        color,
      });
      onclose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Não foi possível salvar.';
    } finally {
      saving = false;
    }
  }
</script>

<Dialog
  title={deck ? 'Editar baralho' : 'Um novo assunto para aprender'}
  onclose={() => {
    if (!saving) onclose();
  }}
>
  <form onsubmit={submit} class="editor-form">
    <p class="muted">Reúna cartões sobre um mesmo tema. Comece pequeno.</p>
    <label
      >Nome do baralho<input
        bind:value={name}
        maxlength="60"
        required
        placeholder="Ex.: Inglês no dia a dia"
      /></label
    >
    <label
      >Descrição <span class="optional">(opcional)</span><textarea
        bind:value={description}
        maxlength="180"
        rows="2"
        placeholder="O que você quer aprender?"></textarea></label
    >
    <fieldset>
      <legend>Cor do baralho</legend>
      <div class="color-choices">
        {#each [{ value: 'sage', label: 'Verde sálvia' }, { value: 'clay', label: 'Terracota' }, { value: 'blue', label: 'Azul' }] as option}
          <label class:chosen={color === option.value} class={option.value}
            ><input
              type="radio"
              name="color"
              value={option.value}
              bind:group={color}
            />{option.label}</label
          >
        {/each}
      </div>
    </fieldset>
    {#if error}<p class="form-error" role="alert">{error}</p>{/if}
    <div class="dialog-actions">
      <button
        class="button secondary"
        type="button"
        disabled={saving}
        onclick={onclose}>Cancelar</button
      ><button class="button primary" disabled={saving}
        >{saving ? 'Salvando…' : 'Salvar baralho'}</button
      >
    </div>
  </form>
</Dialog>
