<script>
  import { createEventDispatcher } from 'svelte';
  export let open = false;
  export let modalClass = '';
  /** Левая колонка — сбоку; по высоте равна колонке «форма + dock» */
  export let showAside = false;
  /** Панель под основной формой, ширина как у `.modal` */
  export let showDock = false;
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
    <div
      class="modal-cluster"
      class:modal-cluster--with-aside={showAside}
      class:modal-cluster--with-dock={showDock}
    >
      {#if showAside}
        <div class="modal-cluster-aside-wrap">
          <slot name="aside" />
        </div>
      {/if}
      <div class="modal-cluster-stack">
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
        {#if showDock}
          <div class="modal-dock-slot">
            <slot name="dock" />
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
