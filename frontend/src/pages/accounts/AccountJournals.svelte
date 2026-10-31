<script>
  import { onMount } from 'svelte';

  import { t, lang, translate_org_type, shortID } from '../../i18n/i18n';
  import TableSkeleton from '../../components/common/TableSkeleton.svelte';
  import { localizeDescription } from '../../utils/localizedDescription.js';

  import { toast } from '../../ToastUI/toast.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import EditJournalModal from '../journals/EditJournalModal.svelte';

  import JournalReceiptModal from '../journals/JournalReceiptModal.svelte';
  import { journalApi } from '../../api/journalApi.js';
  import { accountApi } from '../../api/accountApi.js';
  import { accountTypeApi } from '../../api/accountTypeApi.js';
  import { DEFAULT_PAGE_SIZE } from '../../lib/pagination.js';
  let showReceipt = false;
  let selectedJournal = null;

  export let id;
  import { push } from 'svelte-spa-router';

  let accounts = [];
  let accountTypes = [];
  let currencies = [];
  let journals = [];
  let loading = true;

  let TREASURY_ID = null;

  let modalRef;

  let PAYABLE_ID = null;
  let RECEIVABLE_ID = null;

  let currency = '';
  import { showDate } from '../../calendar.js';

  import AddJournal from '../journals/AddJournal.svelte';

  async function loadAccounts() {
    accountTypes = (await accountTypeApi.getAll({ status: 1 }))?.data || [];
    accounts = (await accountApi.getAll({ status: 1 }))?.data || [];

    PAYABLE_ID = accounts.find((a) => a.code === 'PAYABLE' && a.status === 1)?.id || null;

    RECEIVABLE_ID = accounts.find((a) => a.code === 'RECEIVABLE' && a.status === 1)?.id || null;

    console.log('PAYABLE_ID:', PAYABLE_ID, 'RECEIVABLE_ID:', RECEIVABLE_ID);

    TREASURY_ID = accounts.find((a) => a.code === 'TREASURY' && a.status === 1)?.id || null;
  }

  async function loadCurrencies() {
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    const defaultCurr = currencies.find((c) => c.isDefault);
    if (defaultCurr) currency = defaultCurr.code;
  }

  async function loadJournals() {
    loading = true;

    const today = new Date().toISOString().slice(0, 10);
    const journalResponse = await journalApi.getAll({
      status: 1,
      account_id: Number(id),
      date_from: today,
      date_to: today,
    });

    journals = journalResponse?.data || [];

    // flip debit/credit for treasury account
    journals = journals.map((j) => {
      if (id == TREASURY_ID) {
        return {
          ...j,
          first_entry_debit: j.first_entry_credit,
          first_entry_credit: j.first_entry_debit,
          second_entry_debit: j.second_entry_credit,
          second_entry_credit: j.second_entry_debit,
        };
      }
      return j;
    });
    journals = journals.reverse(); // show latest first
    loading = false;
  }

  onMount(async () => {
    await loadAccounts();
    await loadCurrencies();
    await loadJournals();
  });
  // --- Table State (mirrors ProductsIndex design) ---
  let searchTerm = '';
  let filterAccount = 'all';
  let filterStatus = 'active'; // 'all', 'active', 'inactive'
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';

  function getPageNumbers(current, total) {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        range.push(i);
      }
    }

    for (let i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots;
  }
  $: filteredJournals = (() => {
    let result = journals.slice();

    // Status
    if (filterStatus === 'active') {
      result = result.filter((j) => j.status === 1);
    } else if (filterStatus === 'inactive') {
      result = result.filter((j) => j.status === 0);
    }

    // Account filter
    if (filterAccount !== 'all') {
      result = result.filter(
        (j) => j.first_entry_account === parseInt(filterAccount) || j.second_entry_account === parseInt(filterAccount),
      );
    }

    // Search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((j) => {
        const acctName = getAccountName(j.first_entry_account).toLowerCase();
        return (
          (j.description && j.description.toLowerCase().includes(term)) ||
          acctName.includes(term) ||
          (j.id && String(j.id).includes(term))
        );
      });
    }

    // Sort
    result = result.sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];

      if (sortColumn === 'account') {
        valA = getAccountName(a.first_entry_account);
        valB = getAccountName(b.first_entry_account);
      }

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  })();

  $: paginatedJournals = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredJournals.slice(start, end);
  })();

  $: totalPages = Math.ceil(filteredJournals.length / itemsPerPage);

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  async function deleteJournal(id) {
    // The backend soft-deletes the journal and records the
    // activity log entry atomically.
    await journalApi.remove(id);
    await loadJournals();
  }
  function getAccountName(id) {
    const acc = accounts.find((a) => a.id === id) || {};
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }

  // Reset pagination when filters change
  $: if (searchTerm || filterAccount || filterStatus) {
    currentPage = 1;
  }

  function editJournal(j) {}
  
  import { auth } from '../../auth/authStore';
import { currencyApi } from '../../api/currencyApi.js';
  $: permissions = $auth.permissions;
</script>

<AddJournal on:saved={loadJournals} selectedAccountID={id} />

<div class="card shadow-sm">
  <!-- Toolbar -->
  <div class="card-header bg-body-tertiary border-bottom p-3">
    <div class="row g-3 align-items-center">
      <div class="col-md-6">
        <input type="text" class="form-control" placeholder={t('Search journals...')} bind:value={searchTerm} />
      </div>
      <div class="col-md-6 text-end">
        <select class="form-select form-select-sm d-inline-block w-auto" bind:value={itemsPerPage}>
          <option value={5}>5 {t('per page')}</option>
          <option value={10}>10 {t('per page')}</option>
          <option value={20}>20 {t('per page')}</option>
          <option value={50}>50 {t('per page')}</option>
          <option value={100}>100 {t('per page')}</option>
          <option value={250}>250 {t('per page')}</option>
        </select>
      </div>
    </div>
  </div>
  <div class="card-body p-0">
    {#if loading}
      <TableSkeleton ariaLabel={t('Loading...')} colCount={8} minWidth="980px" />
    {:else}
      <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>
                {t('ID')}
                {#if sortColumn === 'id'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="text-center cursor-pointer" on:click={() => setSort('created_at')}
                >{t('Date')}
                {#if sortColumn === 'created_at'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="text-center cursor-pointer" on:click={() => setSort('account')}
                >{t('Peer Account')}
                {#if sortColumn === 'account'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="text-center">{t('Description')} </th>
              <th class="text-center cursor-pointer">{t('Debit')} </th>
              <th class="text-center cursor-pointer">{t('Credit')} </th>
              <th class="text-center">{t('Reference')}</th>
              <th class="text-center">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedJournals as j}
              <tr>
                <td class="ps-4 text-muted small">{shortID(j.id)}</td>
                <td class="text-center">{@html showDate(j.created_at)}</td>
                <td class="text-center">
                  {#if j.first_entry_account == PAYABLE_ID || j.first_entry_account == RECEIVABLE_ID}
                    <span class="badge badge-success">
                      {getAccountName(j.second_entry_account)}
                    </span>
                  {:else if j.second_entry_account == PAYABLE_ID || j.second_entry_account == RECEIVABLE_ID}
                    <span class="badge badge-success">
                      {getAccountName(j.first_entry_account)}
                    </span>
                  {:else}
                    <span
                      class="badge badge-success"
                      style="cursor: pointer;"
                      on:click={async () => {
                        await push(
                          `/dashboard/account/${j.first_entry_account == id ? j.second_entry_account : j.first_entry_account}`,
                        );
                        await loadJournals(); // refresh journals after coming back
                        // window.location.reload(); // force reload to refresh the journals list for the new account
                      }}>
                      {j.first_entry_account == id
                        ? getAccountName(j.second_entry_account)
                        : getAccountName(j.first_entry_account)}</span>
                  {/if}
                </td>
                <td class="text-center">{localizeDescription(j.description, $lang, t) || '-'}</td>
                <td class="text-center"
                  ><span class="badge badge-danger"
                    >{j.first_entry_debit != 0
                      ? Number(j.first_entry_debit).toLocaleString(undefined, { maximumFractionDigits: 3 }) +
                        ' ' +
                        t(j.currency)
                      : ''}</span
                  ></td>
                <td class="text-center"
                  ><span class="badge badge-success"
                    >{j.first_entry_credit != 0
                      ? Number(j.first_entry_credit).toLocaleString(undefined, { maximumFractionDigits: 3 }) +
                        ' ' +
                        t(j.currency)
                      : ''}</span
                  ></td>
                <td class="text-center">
                  {#if j.reference_type}
                    <span class="badge badge-info">{t(j.reference_type)}</span>
                  {/if}
                </td>
                <td class="text-center">
                  {#if j.reference_type != 'account' && j.reference_id}
                    {#if j.reference_type === 'stock_transfer'}
                      <button
                        class="btn btn-sm btn-outline-success me-1"
                        on:click={() => push(`/dashboard/stock-transfers/${j.reference_id}`)}>
                        <i class="bi bi-box2"></i>
                      </button>
                    {:else if j.reference_type === 'sale'}
                      <button
                        class="btn btn-sm btn-outline-info me-1"
                        on:click={() => push(`/dashboard/sales/${j.reference_id}`)}>
                        <i class="bi bi-cart"></i>
                      </button>
                    {:else if j.reference_type === 'sale_payment'}
                      <button
                        class="btn btn-sm btn-outline-success me-1"
                        on:click={() => {
                          if (j.reference_sale_id) {
                            push(`/dashboard/sales/${j.reference_sale_id}`);
                          }
                        }}>
                        <i class="bi bi-cart"></i>
                      </button>
                    {:else if j.reference_type === 'purchase'}
                      <button
                        class="btn btn-sm btn-outline-info me-1"
                        on:click={() => push(`/dashboard/purchases/${j.reference_id}`)}>
                        <i class="bi bi-truck"></i>
                      </button>
                    {:else if j.reference_type === 'purchase_payment'}
                      <button
                        class="btn btn-sm btn-outline-success me-1"
                        on:click={() => {
                          if (j.reference_purchase_id) {
                            push(`/dashboard/purchases/${j.reference_purchase_id}`);
                          }
                        }}>
                        <i class="bi bi-truck"></i>
                      </button>
                    {:else if j.reference_type === 'exchange'}
                      <button
                        class="btn btn-sm btn-outline-info me-1"
                        on:click={() => push(`/dashboard/exchanges/list`)}>
                        <i class="bi bi-currency-exchange"></i>
                      </button>
                    {/if}
                  {:else}
                    {#if permissions?.some((p) => p.code === 'Journals' && p.edit)}
                      <button class="btn btn-sm btn-outline-secondary me-1" on:click={() => modalRef.openModal(j.id)}>
                        <i class="bi bi-pencil"></i>
                      </button>
                    {/if}
                    {#if permissions?.some((p) => p.code === 'Journals' && p.delete)}
                      <button
                        class="btn btn-sm btn-outline-danger"
                        on:click={() => {
                          toast.confirm(t('Are you sure?'), t("You won't be able to revert this!")).then((result) => {
                            if (result) {
                              deleteJournal(j.id);
                            }
                          });
                        }}>
                        <i class="bi bi-trash"></i>
                      </button>
                    {/if}
                  {/if}
                  <button
                    class="btn btn-sm btn-outline-primary me-1 px-2"
                    on:click={() => {
                      showReceipt = true;
                      selectedJournal = j;
                    }}>
                    <i class="bi bi-printer"></i>
                  </button>
                </td>
              </tr>
            {/each}
            {#if filteredJournals.length === 0}
              <tr>
                <td colspan="12" class="text-center text-muted p-4">{t('No journal entries found.')}</td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
  {#if !loading && filteredJournals.length > 0}
    <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3">
      <div class="text-muted small">
        {t('Showing')}
        {(currentPage - 1) * itemsPerPage + 1}
        {t('to')}
        {Math.min(currentPage * itemsPerPage, filteredJournals.length)}
        {t('of')}
        {filteredJournals.length}
        {t('entries')}
      </div>
      <nav>
        <ul class="pagination pagination-circle pagination-sm mb-0">
          <li class="page-item" class:disabled={currentPage === 1}>
            <button class="page-link" on:click={() => (currentPage = 1)}>
              <i class="bi bi-chevron-double-{t('dir') === 'rtl' ? 'right' : 'left'}"></i>
            </button>
          </li>
          <li class="page-item" class:disabled={currentPage === 1}>
            <button class="page-link" on:click={() => (currentPage -= 1)}>
              <i class="bi bi-chevron-{t('dir') === 'rtl' ? 'right' : 'left'}"></i>
            </button>
          </li>
          {#each getPageNumbers(currentPage, totalPages) as pageNum, idx (pageNum === '...' ? `dot-${idx}` : pageNum)}
            {#if pageNum === '...'}
              <li class="page-item disabled">
                <span class="page-link">...</span>
              </li>
            {:else}
              <li class="page-item" class:active={currentPage === pageNum}>
                <button class="page-link" on:click={() => (currentPage = pageNum)}>{pageNum}</button>
              </li>
            {/if}
          {/each}
          <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
            <button class="page-link" on:click={() => (currentPage += 1)}>
              <i class="bi bi-chevron-{t('dir') === 'rtl' ? 'left' : 'right'}"></i>
            </button>
          </li>
          <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
            <button class="page-link" on:click={() => (currentPage = totalPages)}>
              <i class="bi bi-chevron-double-{t('dir') === 'rtl' ? 'left' : 'right'}"></i>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  {/if}
</div>

<EditJournalModal bind:this={modalRef} on:saved={loadJournals} />

{#if showReceipt}
  <JournalReceiptModal journal={selectedJournal} on:close={() => (showReceipt = false)} />
{/if}

<style>
  .cursor-pointer {
    cursor: pointer;
  }
  .pagination-circle .page-link {
    border-radius: 50% !important;
    margin-left: 3px;
    margin-right: 3px;
    border: none;
  }
</style>
