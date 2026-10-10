<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let {
    title,
    onclose,
    children,
  }: { title: string; onclose: () => void; children: Snippet } = $props();
  let dialog: HTMLDialogElement;
  onMount(() => {
    dialog.showModal();
  });
</script>

<dialog
  bind:this={dialog}
  {onclose}
  oncancel={(event) => {
    event.preventDefault();
    onclose();
  }}
  aria-label={title}
>
  <div class="dialog-heading">
    <h2>{title}</h2>
    <button
      class="icon-button"
      type="button"
      onclick={onclose}
      aria-label="Fechar janela"><Icon name="close" /></button
    >
  </div>
  {@render children()}
</dialog>
