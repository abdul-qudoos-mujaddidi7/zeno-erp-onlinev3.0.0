<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';

  import { toast } from '../../../ToastUI/toast.js';

  import { resolveMediaUrl } from '../../../lib/mediaUrl.js';
  import { t, lang, translate_org_type, shortID } from '../../../i18n/i18n.js';
  import { documentApi } from '../../../api/documentApi.js';
  import { appointmentApi } from '../../../api/appointmentApi.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { showDate } from '../../../calendar.js';

  export let id;

  let viewModalRef = null;
  let viewImageUrl = '';


  let documents = [];

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
    patient_appointments = (await appointmentApi.getAll({ status: 1, patient_id: Number(id) }))?.data || [];
    console.log('Patient appointments:', patient_appointments);
    documents = (await documentApi.getAll({ status: 1, reference_id: Number(id) }))?.data || [];
    for (const appt of patient_appointments) {
      const apptDocs = (await documentApi.getAll({ status: 1, reference_id: Number(appt.id) }))?.data || [];
      documents = [...documents, ...apptDocs];
    }
    documents = documents;
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

          // keep aspect ratio
          const scale = Math.min(canvasSize / width, canvasSize / height);
          const drawWidth = width * scale;
          const drawHeight = height * scale;

          const x = (canvasSize - drawWidth) / 2;
          const y = (canvasSize - drawHeight) / 2;

          canvas.width = canvasSize;
          canvas.height = canvasSize;

          // white background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // draw contained image
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
    const modal = new bootstrap.Modal(modalRef);
    modal.show();
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
  }

  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // get file type
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
    const modal = new bootstrap.Modal(viewModalRef);
    modal.show();
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
      const modal = bootstrap.Modal.getInstance(modalRef);
      modal.hide();
    }
  }

</script>

<div class="table-responsive">
  <table class="table table-sm table-hover mb-0">
    <thead class="table-light">
      <tr>
        <th class="ps-4 cursor-pointer">
          {t('ID')}
        </th>
        <th class="text-center cursor-pointer">{t('Date')} </th>
        <th class="text-center cursor-pointer">{t('Reference')} </th>
        <th class="text-center cursor-pointer">{t('Name')} </th>
        <th class="text-center cursor-pointer">{t('Description')} </th>
        <th class="text-center cursor-pointer">{t('File Type')} </th>
        <th class="text-center cursor-pointer">{t('File Size')} </th>
        <th class="text-center cursor-pointer">{t('Thumbnail')} </th>
        <th class="text-center cursor-pointer">{t('File')} </th>

        <th class="text-center">
          <button class="btn btn-sm btn-primary ms-2 px-2 float-end" on:click={newDocument}>
            <i class="bi bi-plus"></i>
            {t('New Document')}
          </button>
          {t('Actions')}
        </th>
      </tr>
    </thead>
    <tbody>
      {#each documents as d}
        <tr>
          <td class="ps-4 text-muted small" style="vertical-align: middle;">
            {shortID(d.id)}
          </td>

          <td class="text-center" style="vertical-align: middle;">{@html showDate(d.created_at.slice(0, 10))}</td>
          <td class="text-center" style="vertical-align: middle;">
            {#if d.reference_type === 'appointment'}
              <span class="badge badge-success" on:click={()=>push(`/dashboard/appointment/${d.reference_id}`)} style="cursor:pointer">
                {t('Appointment')} {shortID(d.reference_id)}
              </span>
            {:else}
              -
            {/if}
          </td>

          <td class="text-center" style="vertical-align: middle;">
            {t(d.name)}
          </td>
          <td class="text-center" style="vertical-align: middle;">
            {t(d.description)}
          </td>
          <td class="text-center" style="vertical-align: middle;">
            {d.file_type.split('/')[1].toUpperCase()}
          </td>
          <td class="text-center" style="vertical-align: middle;">
            <span dir="ltr">{humanSizeFormat(d.file_size)}</span>
          </td>

          <td class="text-center" style="vertical-align: middle;">
            {#if d.thumbnail}
              <img src={getThumbnail(d.thumbnail)} alt="Thumbnail" style="max-height: 60px;" />
            {/if}
          </td>
          <td class="text-center" style="vertical-align: middle;">
            {#if d.file}
              <button class="btn btn-sm btn-outline-secondary px-2" on:click={() => downloadFile(d.file, d.name)}>
                <i class="bi bi-download"></i>
                {t('Download')}
              </button>
            {/if}
          </td>
          <td class="text-center" style="vertical-align: middle;">
            {#if d.file_type.startsWith('image/') && d.file}
              <button class="btn btn-sm btn-outline-primary px-2 me-2" on:click={() => viewImage(d.file)}>
                <i class="bi bi-eye"></i>
                {t('View')}
              </button>
            {/if}
          
            <button
              class="btn btn-sm btn-outline-danger px-2"
              on:click={() => {
                deleteDocument(d);
              }}>
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
      {/each}
      {#if documents.length === 0}
        <tr>
          <td colspan="12" class="text-center text-muted p-4">{t('No documents found.')}</td>
        </tr>
      {/if}
    </tbody>
  </table>
</div>



<div class="modal fade" id="createDocumentModal" bind:this={modalRef} tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-lg modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-plus-circle"></i>
          {editingId ? t('Update Document') : t('New Document')}
        </h5>
        <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
      </div>

      <div class="modal-body">
        <div class="row">
          <div class="col-md-12 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-name" class="form-control" bind:value={name} />
              <label class="form-label" for="c-name">{t('Name')}</label>
            </div>
          </div>

          <div class="col-md-12 mb-4">
            {#if modalImageUrl}
              <div class="text-center mb-3">
                <img src={modalImageUrl} alt="Preview" class="" style="max-height: 320px;" />
              </div>
            {/if}
          </div>

          <div class="col-md-12 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="file" id="c-image" on:change={handleFileUpload} class="form-control form-control-sm" />

              <label class="form-label" for="c-image">{t('Image')}</label>
            </div>
          </div>

          <div class="col-md-12 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <textarea id="c-description" class="form-control" bind:value={description}></textarea>
              <label class="form-label" for="c-description">{t('Description')}</label>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-link text-dark" data-mdb-dismiss="modal">{t('Close')}</button>
        <button type="button" class="btn btn-primary" on:click={saveDocument}>
          {editingId ? t('Update Document') : t('New Document')}
        </button>
      </div>
    </div>
  </div>
</div>
