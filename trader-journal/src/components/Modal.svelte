<script>
  import { createEventDispatcher } from 'svelte';
  export let open = false;
  export let modalClass = '';
  /** Закрытие по клику на подложку */
  export let closeOnBackdrop = true;
  /** Кнопка × в шапке */
  export let showCloseButton = true;
  const dispatch = createEventDispatcher();

  function handleBackdropClick(e) {
    if (!closeOnBackdrop) return;
    if (e.target === e.currentTarget) {
      dispatch('close');
    }
  }
</script>

{#if open}
  <div class="modal-overlay" on:click={handleBackdropClick}>
    <div class={`modal ${modalClass}`}>
      <div class="modal-header">
        <slot name="header" />
        {#if showCloseButton}
          <button type="button" class="modal-close" on:click={() => dispatch('close')}>×</button>
        {/if}
      </div>
      <div class="modal-body">
        <slot name="body" />
      </div>
      <div class="modal-footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
{/if}