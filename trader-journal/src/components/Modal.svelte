<script>
  import { createEventDispatcher } from 'svelte';
  export let open = false;
  export let modalClass = '';
  const dispatch = createEventDispatcher();
  
  function handleBackdropClick(e) {
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
        <button class="modal-close" on:click={() => dispatch('close')}>×</button>
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