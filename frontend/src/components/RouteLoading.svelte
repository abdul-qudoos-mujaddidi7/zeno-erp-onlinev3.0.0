<script>
  import RouteSkeleton from './common/RouteSkeleton.svelte';

  export let params = undefined;
  void params;
</script>

<!-- Full-page placeholder: a route chunk that is still downloading draws the
     shell it will fill, never a lone spinning circle. -->
<div class="route-loading">
  <RouteSkeleton rows={8} />
</div>

<style>
  .route-loading {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    padding: 1rem;
  }
</style>
