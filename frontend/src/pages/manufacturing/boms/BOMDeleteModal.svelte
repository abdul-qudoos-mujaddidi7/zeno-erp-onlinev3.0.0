<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { push } from 'svelte-spa-router';
  import { toast } from '../../../ToastUI/toast.js';
  import ConfirmActionModal from '../../../components/common/ConfirmActionModal.svelte';
  import { bomApi } from '../../../api/bomApi.js';

  export let bom;

  const dispatch = createEventDispatcher();

  let saving = false;
  let loading = true;

  let bom_items = [];
  let bom_operations = [];

  onMount(() => {
    loadBOMDetails();
  });

  async function loadBOMDetails() {
    if (!bom) return;

    try {
      const fetchedBom = (await bomApi.getById(bom.id))?.data || null;
      if (fetchedBom && Number(fetchedBom.status) === 1) {
        bom = fetchedBom;
      }

      bom_items = (bom.items || []).filter((item) => Number(item.status) === 1);
      bom_operations = (bom.operations || []).filter((op) => Number(op.status) === 1);
    } catch (e) {
      console.error('Error loading BOM details:', e);
    } finally {
      loading = false;
    }
  }

  async function doDeleteBOM() {
    saving = true;
    try {
      await bomApi.remove(bom.id);

      toast.success(t('Deleted!'), t('BOM deleted successfully.'));

      dispatch('close');
      push(`/dashboard/boms`);
    } catch (e) {
      console.error('Error deleting bom:', e);
      toast.error(t('Error'), t('An error occurred while deleting the BOM.'));
    } finally {
      saving = false;
    }
  }
</script>

<ConfirmActionModal
  title={t('Delete BOM')}
  icon="bi-trash"
  variant="danger"
  dangerAlert
  {loading}
  {saving}
  savingLabel={t('Deleting...')}
  warningMessage={t('Are you sure you want to delete this BOM? This action cannot be undone.')}
  warningDetail={t('All associated items and operations will also be deleted.')}
  stats={[
    { label: t('Associated Items'), value: loading ? '…' : bom_items.length },
    { label: t('Associated Operations'), value: loading ? '…' : bom_operations.length },
  ]}
  actionLabel={t('Delete')}
  actionIcon="bi-trash"
  actionVariant="danger"
  inputId="delete-bom-confirm-input"
  confirmPrompt={{
    title: t('Are you sure?'),
    message: t('Are you sure you want to delete this BOM? This action cannot be undone.'),
    confirmText: t('Yes, delete it!'),
    cancelText: t('No, keep it'),
    variant: 'danger',
    icon: 'bi-trash',
  }}
  on:confirm={doDeleteBOM}
  on:close={() => dispatch('close')} />
