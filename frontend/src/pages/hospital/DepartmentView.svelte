<script>
  import { departmentApi } from '../../api/departmentApi.js';
  import { onMount, onDestroy } from 'svelte';

  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import { push } from 'svelte-spa-router';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;


  // departments: "++id,name,location,description,status",

  let loading = true;
  let departments = [];
  function handleKeyDown(e) {
    if (e.key === 'Shift') shiftPressed = true;
    if (e.key === 'Control') ctrlPressed = true;
  }
  function handleKeyUp(e) {
    if (e.key === 'Shift') shiftPressed = false;
    if (e.key === 'Control') ctrlPressed = false;
  }

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  });

  export let selectedDepartmentId = null;

  async function loadDepartments() {
    loading = true;
    try {
      departments = (await departmentApi.getAll({ status: 1 }))?.data || [];
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      loading = false;
    }
  }


  async function loadAll() {
    await loadDepartments();
  }
  onMount(async () => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    if (window.mdb) {
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
    }
    await loadAll();
  });


</script>

{#if selectedDepartmentId !== null}
  <h1>Showing View of Department: {selectedDepartmentId}</h1>
{:else}
  <div class="text-center text-muted p-4">
    <i class="bi bi-box-seam fs-1 mb-3"></i>
    <p class="h5">{t('Select a department to view its products.')}</p>
  </div>
{/if}
