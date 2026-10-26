<!--
  Throw-away render harness for the Journal table's row actions.

  It mounts the production JournalsIndex with a stubbed API so the kebab
  trigger and its menu can be screenshotted next to Journal.dc.html.
  Nothing here ships; delete with ta-preview.js and ta-preview.html.
-->
<script>
  import JournalsIndex from './pages/journals/JournalsIndex.svelte';
</script>

<div class="ta-preview">
  <JournalsIndex />
</div>

<style>
  :global(html),
  :global(body) {
    height: 100%;
  }

  .ta-preview {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 16px 18px;
    box-sizing: border-box;
    background: #eef2f8;
  }
</style>
