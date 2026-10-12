<script>
  import { tick } from 'svelte';
  import { onceAsync } from '../lib/onceAsync.js';

  export let loader;
  let component;
  let instance;
  const initialize = onceAsync(async () => {
    component = (await loader()).default;
    await tick();
    await instance.initialize();
    return instance;
  });

  export async function openModal(...args) {
    return (await initialize()).openModal(...args);
  }

  export async function editProduct(...args) {
    return (await initialize()).editProduct(...args);
  }
</script>

{#if component}
  <svelte:component this={component} bind:this={instance} {...$$restProps} on:saved on:close />
{/if}
