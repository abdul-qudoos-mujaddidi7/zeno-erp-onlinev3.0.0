<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { toast } from '../../ToastUI/toast.js';
  import { resolveMediaUrl } from '../../lib/mediaUrl.js';
  import { t, lang, translate_org_type, shortID } from '../../i18n/i18n.js';
  import { documentApi } from '../../api/documentApi.js';
  import { appointmentApi } from '../../api/appointmentApi.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  import { showDate } from '../../calendar.js';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import AppModal from '../../components/common/AppModal.svelte';
  import { DEFAULT_PAGE_SIZE } from '../../lib/pagination.js';

  export let id;
  let viewModalRef = null;
  let viewImageUrl = '';
  let documents = [];
  let loading = true;
  let searchTerm = '';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let showDocumentModal = false;
  let showPreviewModal = false;

  $: filteredDocuments = documents.filter((document) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;
    return [document.id, document.name, document.description, document.file_type]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });
  $: totalPages = Math.max(1, Math.ceil(filteredDocuments.length / itemsPerPage));
  $: if (currentPage > totalPages) currentPage = totalPages;
  $: paginatedDocuments = filteredDocuments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  function getPageNumbers(current, total) {
    if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
    const pages = [1];
    if (current > 3) pages.push('...');
    for (let page = Math.max(2, current - 1); page <= Math.min(total - 1, current + 1); page++) pages.push(page);
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  }
  function humanSizeFormat(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(2)} ${units[i]}`;
  }
  onMount(async () => {
    await loadDocuments();
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
          new window.mdb.Input(el);
        });
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 50);
  });

  let patient_appointments = [];

  async function loadDocuments() {
    loading = true;
    patient_appointments = (await appointmentApi.getAll({ status: 1, patient_id: Number(id) }))?.data || [];
    console.log('Patient appointments:', patient_appointments);
    documents = (await documentApi.getAll({ status: 1, reference_id: Number(id) }))?.data || [];
    for (const appt of patient_appointments) {
      const apptDocs = (await documentApi.getAll({ status: 1, reference_id: Number(appt.id) }))?.data || [];
      documents = [...documents, ...apptDocs];
    }
    documents = documents;
    loading = false;
    console.log('Loaded documents:', documents);
  }
  function convertToWebP(file, maxWidth = 800, fixedSize = null) {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => (img.src = e.target.result);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let width = img.width;
        let height = img.height;
        if (fixedSize) {
          const canvasSize = fixedSize;
          const scale = Math.min(canvasSize / width, canvasSize / height);
          const drawWidth = width * scale;
          const drawHeight = height * scale;
          const x = (canvasSize - drawWidth) / 2;
          const y = (canvasSize - drawHeight) / 2;
          canvas.width = canvasSize;
          canvas.height = canvasSize;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, x, y, drawWidth, drawHeight);
        } else {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
        }
        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      reader.readAsDataURL(file);
    });
  }
  let editingId = null;
  let name = '';
  let file_type = '';
  let file_size = 0;
  let description = '';
  let fileBase64 = '';
  let thumbnailBase64 = '';
  let modalImageUrl = '';
  function resetForm() {
    editingId = null;
    name = '';
    file_type = '';
    file_size = 0;
    fileBase64 = '';
    thumbnailBase64 = '';
    modalImageUrl = '';
    description = '';
  }
  function newDocument() {
    resetForm();
    showDocumentModal = true;
  }
  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const fileType = file.type.split('/')[0];
    console.log('File type:', file.type, 'Detected type:', fileType);
    name = file.name;
    file_type = file.type;
    file_size = file.size;
    console.log('File size:', file_size);
    fileBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
    if (fileType === 'image') {
      thumbnailBase64 = await convertToWebP(file, 400);
      modalImageUrl = thumbnailBase64;
    }
  }

  function getThumbnail(url) {
    return resolveMediaUrl(url);
  }

  function viewImage(url) {
    viewImageUrl = getThumbnail(url);
    showPreviewModal = true;
  }

  function downloadFile(url, filename) {
    let file = resolveMediaUrl(url);
    const link = document.createElement('a');
    link.href = file;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  let modalRef;

  function deleteDocument(doc) {
    toast.confirm(t('Are you sure?'), t("You won't be able to revert this!")).then(async (result) => {
      if (result) {
        await documentApi.remove(doc.id);
        toast.success(t('Success'), t('Document deleted successfully'));
        loadDocuments();
      }
    });
  }

  async function saveDocument() {
    if (!name || !fileBase64) {
      alert(t('Please provide a name and select a file.'));
      return;
    }
    if (!editingId) {
      const newDoc = {
        name,
        description,
        reference_type: 'account',
        reference_id: Number(id),
        file_type,
        file_size,
        file: fileBase64,
        thumbnail: thumbnailBase64,
        status: 1,
      };
      await documentApi.create(newDoc);
      toast.success(t('Success'), t('Document added successfully'));
      loadDocuments();
      showDocumentModal = false;
    }
  }
</script>

<div class="account-documents-page">
<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Documents')}
  toolbarWidth="25rem"
  showFooter={!loading && filteredDocuments.length > 0}
  dense={true}
  tablePadding={true}>
  <svelte:fragment slot="actions">
    <button type="button" class="quick-add-button" on:click={newDocument}>
      <i class="bi bi-plus-lg" aria-hidden="true"></i>
      <span>{t('New Document')}</span>
    </button>
  </svelte:fragment>
  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchTerm}
      searchPlaceholder={t('Search documents...')}
      filters={[]}
      showReset={false}
      on:searchChange={(event) => { searchTerm = event.detail; currentPage = 1; }} />
  </svelte:fragment>

  {#if loading}
    <div class="table-state"><EmptyState loading message={t('Loading...')} /></div>
  {:else if filteredDocuments.length === 0}
    <div class="table-state"><EmptyState icon="bi-folder2-open" message={t('No documents found.')} /></div>
  {:else}
  <DataTable ariaLabel={t('Documents')} minWidth="900px" dense striped hover={false} stickyHeader layout="fixed" scrollbar="thin">
    <svelte:fragment slot="head">
      <tr>
        <th>{t('ID')}</th><th>{t('Date')}</th><th>{t('Name')}</th><th>{t('Description')}</th>
        <th>{t('File Type')}</th><th>{t('File Size')}</th><th>{t('Thumbnail')}</th><th>{t('Actions')}</th>
      </tr>
    </svelte:fragment>
      {#each paginatedDocuments as d}
        <tr>
          <td class="cell-muted">{shortID(d.id)}</td>
          <td>{@html d.created_at ? showDate(d.created_at.slice(0, 10)) : '—'}</td>
          <td class="document-name">{t(d.name)}</td>
          <td><span class="description-cell" title={d.description || ''}>{d.description || '—'}</span></td>
          <td><span class="file-badge">{d.file_type?.split('/')[1]?.toUpperCase() || '—'}</span></td>
          <td><span dir="ltr">{humanSizeFormat(d.file_size || 0)}</span></td>
          <td>
            {#if d.thumbnail}
              <button class="thumbnail-button" on:click={() => viewImage(d.file || d.thumbnail)} aria-label={t('View')}>
                <img src={getThumbnail(d.thumbnail)} alt={d.name} />
              </button>
            {:else}<span class="muted-dash">—</span>
            {/if}
          </td>
          <td><div class="row-actions">
            {#if d.file_type?.startsWith('image/') && d.file}
              <button class="icon-action view" on:click={() => viewImage(d.file)} title={t('View')}><i class="bi bi-eye"></i></button>
            {/if}
            {#if d.file}<button class="icon-action" on:click={() => downloadFile(d.file, d.name)} title={t('Download')}><i class="bi bi-download"></i></button>{/if}
            <button class="icon-action danger" on:click={() => deleteDocument(d)} title={t('Delete')}><i class="bi bi-trash"></i></button>
          </div></td>
        </tr>
      {/each}
  </DataTable>
  {/if}
  <svelte:fragment slot="footer">
    <PaginationBar bind:currentPage {totalPages} {itemsPerPage} totalItems={filteredDocuments.length}
      ariaLabel="Pagination" rowLabel={t('rows')} on:perPageChange={(event) => (itemsPerPage = Number(event.detail))}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>
</div>

{#if showPreviewModal}
  <AppModal title={t('Image Preview')} icon="bi-image" size="lg" on:close={() => (showPreviewModal = false)}>
    <div class="preview-wrap"><img src={viewImageUrl} alt={t('Image Preview')} /></div>
  </AppModal>
{/if}

{#if showDocumentModal}
  <AppModal title={t('New Document')}  showIcon={false} size="md"
    on:close={() => (showDocumentModal = false)}>
    <form class="document-form" dir={t('dir')} on:submit|preventDefault={saveDocument}>
      <label class="document-field"><span>{t('Name')}</span><input type="text" bind:value={name} autocomplete="off" /></label>
      <label class="document-field file-field">
        <span>{t('File')}</span>
        <span class="file-picker">
          <i class="bi bi-cloud-arrow-up"></i>
          <span>{name || t('Choose File')}</span>
          <input type="file" on:change={handleFileUpload} />
        </span>
      </label>
      {#if modalImageUrl}<div class="upload-preview"><img src={modalImageUrl} alt="Preview" /></div>{/if}
      <label class="document-field field-full"><span>{t('Description')}</span><textarea rows="3" bind:value={description}></textarea></label>
      <button type="submit" class="document-submit"><i class="bi bi-check2-circle"></i>{t('New Document')}</button>
    </form>
  </AppModal>
{/if}

<style>
  .account-documents-page { display:flex; flex:1 1 auto; width:100%; height:100%; min-height:0; overflow:hidden; }
  .quick-add-button { display:inline-flex; align-items:center; gap:.45rem; min-height:2.625rem; padding:.55rem 1rem; border:0; border-radius:.6rem; color:#fff; background:#0f6efd; font-weight:700; box-shadow:0 8px 18px rgba(37,99,235,.18); }
  .table-state { display:grid; place-items:center; min-height:18rem; }
  .cell-muted { color:#94a3b8; }
  .document-name { color:#172033; font-weight:700; }
  .description-cell { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .file-badge { display:inline-flex; padding:.25rem .55rem; border-radius:999px; color:#0f6efd; background:#eff6ff; font-size:.75rem; font-weight:700; }
  .thumbnail-button { width:2.5rem; height:2.5rem; padding:0; overflow:hidden; border:1px solid #dbe4ef; border-radius:.5rem; background:#fff; }
  .thumbnail-button img { width:100%; height:100%; object-fit:cover; }
  .row-actions { display:inline-flex; gap:.35rem; }
  .icon-action { display:grid; place-items:center; width:2rem; height:2rem; border:1px solid #dbe4ef; border-radius:.5rem; color:#64748b; background:#fff; }
  .icon-action.view { color:#0f6efd; background:#eff6ff; } .icon-action.danger { color:#dc2626; background:#fff1f2; }
  .muted-dash { color:#cbd5e1; }
  .preview-wrap { display:grid; place-items:center; min-height:16rem; } .preview-wrap img { max-width:100%; max-height:65vh; border-radius:.75rem; object-fit:contain; }
  .document-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.85rem; }
  .document-field { display:grid; gap:.45rem; min-width:0; margin:0; color:#334155; font-size:.84rem; font-weight:700; text-align:start; }
  .field-full, .upload-preview, .document-submit { grid-column:1 / -1; }
  .document-field > input, .document-field textarea { width:100%; min-height:2.625rem; padding:.5rem .7rem; border:1px solid #dbe3ef; border-radius:.625rem; outline:none; background:#fff; color:#0f172a; }
  .document-field textarea { min-height:92px; resize:vertical; }
  .document-field > input:focus, .document-field textarea:focus { border-color:#0f6efd; box-shadow:0 0 0 3px rgba(37,99,235,.12); }
  .file-picker { position:relative; display:flex; align-items:center; gap:.5rem; height:2.625rem; min-width:0; padding:0 .7rem; overflow:hidden; border:1px dashed #bfdbfe; border-radius:.625rem; color:#0f6efd; background:#f8fbff; cursor:pointer; }
  .file-picker > span { overflow:hidden; color:#64748b; font-weight:500; text-overflow:ellipsis; white-space:nowrap; }
  .file-picker input { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; }
  .upload-preview { display:grid; place-items:center; padding:.65rem; border:1px dashed #bfdbfe; border-radius:.625rem; background:#f8fbff; }
  .upload-preview img { max-width:100%; max-height:12rem; border-radius:.5rem; }
  .document-submit { display:inline-flex; align-items:center; justify-content:center; gap:.4rem; min-height:2.625rem; margin-top:.125rem; border:0; border-radius:.625rem; color:#fff; background:#0f6efd; font-size:.9rem; font-weight:700; }
  .document-submit:hover { background:#1d4ed8; }
  :global(html.dark) .document-field,
  :global(body.dark) .document-field,
  :global([data-theme='dark']) .document-field { color:#dbe7f7; }
  :global(html.dark) .document-field > input,
  :global(html.dark) .document-field textarea,
  :global(body.dark) .document-field > input,
  :global(body.dark) .document-field textarea,
  :global([data-theme='dark']) .document-field > input,
  :global([data-theme='dark']) .document-field textarea {
    border-color:#334762;
    background:#111c2f;
    color:#e5edf8;
  }
  :global(html.dark) .document-field > input:focus,
  :global(html.dark) .document-field textarea:focus,
  :global(body.dark) .document-field > input:focus,
  :global(body.dark) .document-field textarea:focus,
  :global([data-theme='dark']) .document-field > input:focus,
  :global([data-theme='dark']) .document-field textarea:focus {
    border-color:#60a5fa;
    box-shadow:0 0 0 3px rgba(96,165,250,.18);
  }
  :global(html.dark) .file-picker,
  :global(body.dark) .file-picker,
  :global([data-theme='dark']) .file-picker {
    border-color:#3b82f6;
    background:#0f1a2d;
    color:#60a5fa;
  }
  :global(html.dark) .file-picker > span,
  :global(body.dark) .file-picker > span,
  :global([data-theme='dark']) .file-picker > span { color:#dbe7f7; }
  :global(html.dark) .upload-preview,
  :global(body.dark) .upload-preview,
  :global([data-theme='dark']) .upload-preview {
    border-color:#3b82f6;
    background:#0f1a2d;
  }
  :global(html.dark) .document-submit,
  :global(body.dark) .document-submit,
  :global([data-theme='dark']) .document-submit { background:#1976ff; box-shadow:0 12px 28px rgba(25,118,255,.24); }
  :global(html.dark) .document-submit:hover,
  :global(body.dark) .document-submit:hover,
  :global([data-theme='dark']) .document-submit:hover { background:#2563eb; }
  @media (max-width:640px) { .document-form { grid-template-columns:1fr; } .field-full, .upload-preview, .document-submit { grid-column:1; } }
</style>
