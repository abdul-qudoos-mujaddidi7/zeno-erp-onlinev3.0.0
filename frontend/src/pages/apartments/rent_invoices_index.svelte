<script>
	import { onMount, onDestroy } from 'svelte';
	import { rentInvoiceApi } from '../../api/rentInvoiceApi.js';
	import { leaseApi } from '../../api/leaseApi.js';
	import { accountApi } from '../../api/accountApi.js';
	import { t, shortID } from '../../i18n/i18n.js';
	import { DEFAULT_PAGE_SIZE, readListMeta } from '../../lib/pagination.js';

	let mode = 'list';
	let rent_invoices = [];
	let loading = true;
	let leases = [];
	let accounts = [];
	let lookupsLoaded = false;

	export let account_id = null;

	import RentInvoiceModal from './RentInvoiceModal.svelte';
	let rent_invoiceModalRef = null;

	import RentInvoiceA4ReceiptModal from './RentInvoiceA4ReceiptModal.svelte';

	let showA4Receipt = false;
	let selectedA4Invoice = null;

	let filterLease = 'all';
	let filterAccount = 'all';
	let searchTerm = '';
	let currentPage = 1;
	let itemsPerPage = DEFAULT_PAGE_SIZE;
	let sortColumn = 'created_at';
	let sortDirection = 'desc';
	let totalItems = 0;
	let totalPages = 0;
	let bootstrapped = false;
	let lastPageKey = '';
	let searchDebounceTimer = null;
	let loadRequestId = 0;

	async function loadLookups() {
		if (lookupsLoaded) return;
		try {
			const [leaseRes, accRes] = await Promise.all([
				leaseApi.getAll({ status: 1 }),
				accountApi.getAll({ status: 1 }),
			]);
			leases = leaseRes?.data || [];
			accounts = (accRes?.data || [])
				.filter((w) => w.status === 1)
				.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
			lookupsLoaded = true;
		} catch (err) {
			console.error('Failed to load lookups:', err);
			leases = [];
			accounts = [];
		}
	}

	function pageKey() {
		return `${currentPage}|${itemsPerPage}|${filterLease}|${filterAccount}|${account_id || ''}`;
	}

	async function load() {
		const requestId = ++loadRequestId;
		lastPageKey = pageKey();
		loading = true;
		try {
			await loadLookups();
			const query = {
				status: 1,
				search: searchTerm.trim(),
				page: currentPage,
				limit: itemsPerPage,
			};
			if (filterLease !== 'all') query.lease_id = filterLease;

			const response = await rentInvoiceApi.getAll(query);
			if (requestId !== loadRequestId) return;

			let rows = response?.data || [];
			const meta = readListMeta(response, rows.length);

			const tenantFilter = account_id
				? parseInt(account_id)
				: filterAccount !== 'all'
					? parseInt(filterAccount)
					: null;

			if (tenantFilter) {
				rows = rows.filter((p) => {
					const lease = leases.find((b) => b.id === p.lease_id);
					return lease && lease.tenant_account_id === tenantFilter;
				});
				totalItems = rows.length;
				totalPages = Math.ceil(totalItems / itemsPerPage) || 0;
			} else {
				totalItems = meta.total;
				totalPages = meta.totalPages || Math.ceil(totalItems / itemsPerPage) || 0;
			}

			rent_invoices = rows;
		} catch (err) {
			console.error('Failed to load rent invoices:', err);
			if (requestId === loadRequestId) {
				rent_invoices = [];
				totalItems = 0;
				totalPages = 0;
			}
		} finally {
			if (requestId === loadRequestId) loading = false;
		}
	}

	function scheduleSearchReload() {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			if (currentPage !== 1) currentPage = 1;
			else load();
		}, 300);
	}

	function onFilterChange() {
		if (currentPage !== 1) currentPage = 1;
		else load();
	}

	onMount(() => {
		lastPageKey = pageKey();
		bootstrapped = true;
		load();
	});

	onDestroy(() => {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
	});

	$: if (bootstrapped) {
		void currentPage;
		void itemsPerPage;
		void filterLease;
		void filterAccount;
		const key = pageKey();
		if (key !== lastPageKey) {
			lastPageKey = key;
			load();
		}
	}

	function setSort(col) {
		if (sortColumn === col) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		else { sortColumn = col; sortDirection = 'asc'; }
	}

	$: filtered = (() => {
		let res = rent_invoices.slice();
		res = res.sort((a,b)=>{
			let A = a[sortColumn]; let B = b[sortColumn];
			if (A === undefined || A === null) return 1;
			if (B === undefined || B === null) return -1;
			if (typeof A === 'string') A = A.toLowerCase(); if (typeof B === 'string') B = B.toLowerCase();
			if (A < B) return sortDirection === 'asc' ? -1 : 1;
			if (A > B) return sortDirection === 'asc' ? 1 : -1;
			return 0;
		});
		return res;
	})();

	$: paginated = filtered;
</script>

{#if mode === 'list'}
	{#if loading}
		<div>Loading...</div>
	{:else}
		<div class="card shadow-2">
			<div class="card-header bg-body-tertiary border-bottom p-3">
				<div class="row g-3 align-items-center">
					<div class="col-md-4">
						<input
							class="form-control"
							placeholder={t('Search rent invoices...')}
							value={searchTerm}
							on:input={(e) => {
								searchTerm = e.currentTarget.value;
								scheduleSearchReload();
							}}
						/>
					</div>
					<div class="col-md-2">
						<select
							class="form-select form-select-sm me-3"
							value={filterLease}
							on:change={(e) => {
								filterLease = e.currentTarget.value;
								onFilterChange();
							}}
						>
						<option value="all">{t('All')+' '+t('Leases')}</option>
							{#each leases as lease}
								<option value={lease.id}>{lease.lease_number}</option>
							{/each}
						</select>
					</div>
					<div class="col-md-2">
						<select
							class="form-select form-select-sm me-3"
							value={filterAccount}
							on:change={(e) => {
								filterAccount = e.currentTarget.value;
								onFilterChange();
							}}
						>
						<option value="all">{t('All')+' '+t('Accounts')}</option>
							{#each accounts as account}
								<option value={account.id}>{account.name}</option>
							{/each}
						</select>
					</div>
					<div class="col-md-2 text-end">
						<select
							class="form-select form-select-sm d-inline-block w-auto"
							value={itemsPerPage}
							on:change={(e) => {
								itemsPerPage = Number(e.currentTarget.value);
								currentPage = 1;
							}}
						>
							<option value={15}>15 {t('per page')}</option>
							<option value={25}>25 {t('per page')}</option>
							<option value={50}>50 {t('per page')}</option>
							<option value={100}>100 {t('per page')}</option>
						</select>
					</div>
					<div class="col-md-2">
						<button class="btn btn-primary w-100" on:click={()=>{rent_invoiceModalRef?.openRentInvoiceModal()}}><i class="bi bi-plus-circle me-2"></i>{t('New Rent Invoice')}</button>
					</div>
				</div>
			</div>

			<div class="card-body p-0">
				<div class="table-responsive">
					<table class="table table-hover table-sm align-middle">
						<thead class="table-light">
							<tr>
								<th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>{t('ID')}{#if sortColumn === 'id'}<i
									class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('lease_id')}>{t('Lease')}{#if sortColumn === 'lease_id'}<i
									class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
								>{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('tenant_account_id')}>{t('Account')}{#if sortColumn === 'tenant_account_id'}<i
									class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
								>{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('invoice_number')}>{t('Rent Invoice Number')}{#if sortColumn === 'invoice_number'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('issue_date')}>{t('Issue Date')}{#if sortColumn === 'issue_date'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('due_date')}>{t('Due Date')}{#if sortColumn === 'due_date'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('base_rent')}>{t('Base Rent')}{#if sortColumn === 'base_rent'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('utility_charges')}>{t('Utility Charges')}{#if sortColumn === 'utility_charges'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('other_charges')}>{t('Other Charges')}{#if sortColumn === 'other_charges'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('total_amount')}>{t('Total Amount')}{#if sortColumn === 'total_amount'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('invoice_status')}>{t('Invoice Status')}{#if sortColumn === 'invoice_status'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('created_at')}>{t('Created')}{#if sortColumn === 'created_at'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
								<th width="150" class="text-center">{t('Actions')}</th>
							</tr>
						</thead>
						<tbody>
							{#each paginated as w}
								<tr>
									<td class="ps-4 text-muted small">{shortID(w.id)}</td>
                                    <td class="text-center">{leases.find(b => b.id === w.lease_id)?.lease_number || ''}</td>
                                    <td class="text-center">{accounts.find(b => b.id === leases.find(b => b.id === w.lease_id)?.tenant_account_id)?.name || ""}</td>
                                    <td class="text-center">{w.invoice_number}</td>
                                    <td class="text-center">{w.issue_date}</td>
                                    <td class="text-center">{w.due_date}</td>
                                    <td class="text-center">{Number(w.base_rent || 0).toLocaleString(undefined,{maximumFractionDigits: 3})} {t(w.currency)}</td>
                                    <td class="text-center">{Number(w.utility_charges || 0).toLocaleString(undefined,{maximumFractionDigits: 3})} {t(w.currency)}</td>
                                    <td class="text-center">{Number(w.other_charges || 0).toLocaleString(undefined,{maximumFractionDigits: 3})} {t(w.currency)}</td>
                                    <td class="text-center">{Number(w.total_amount || 0).toLocaleString(undefined,{maximumFractionDigits: 3})} {t(w.currency)}</td>
                                    <td class="text-center">{w.invoice_status}</td>
									<td class="text-center" dir='ltr'>{w.created_at ? new Date(w.created_at).toLocaleString() : ''}</td>
									<td class="text-center">
                                          <button
                                                    class="btn btn-sm btn-outline-warning me-1"
                                                    on:click={() =>
                                                        rent_invoiceModalRef?.editRentInvoice(
                                                            w,
                                                        )}
                                                >
                                                    <i class="bi bi-pencil"></i>
                                                </button>
												  <button
    on:click={() => {
      selectedA4Invoice = w;
      showA4Receipt = true;
    }}
    class="btn btn-outline-primary btn-sm me-2 px-2">
    <i class="bi bi-printer"></i>
  </button>
									</td>
								</tr>
							{/each}
							{#if filtered.length === 0}
								<tr><td colspan="15" class="text-center text-muted p-4">{t('No rent_invoices found.')}</td></tr>
							{/if}
						</tbody>
					</table>
				</div>
			</div>

			{#if !loading && totalItems > 0}
				<div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3">
					<div class="text-muted small">{t('Showing')} {(currentPage-1)*itemsPerPage+1} {t('to')} {Math.min(currentPage*itemsPerPage, totalItems)} {t('of')} {totalItems} {t('entries')}</div>
					<nav>
						<ul class="pagination pagination-circle pagination-sm mb-0">
							<li class="page-item" class:disabled={currentPage === 1}><button class="page-link" on:click={() => (currentPage = 1)}>&laquo;</button></li>
							<li class="page-item" class:disabled={currentPage === 1}><button class="page-link" on:click={() => (currentPage -= 1)}>&lt;</button></li>
							{#each Array(totalPages) as _, i}
								<li class="page-item" class:active={currentPage === i+1}><button class="page-link" on:click={() => (currentPage = i+1)}>{i+1}</button></li>
							{/each}
							<li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}><button class="page-link" on:click={() => (currentPage += 1)}>&gt;</button></li>
							<li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}><button class="page-link" on:click={() => (currentPage = totalPages)}>&raquo;</button></li>
						</ul>
					</nav>
				</div>
			{/if}
		</div>
	{/if}
{/if}

<RentInvoiceModal bind:this={rent_invoiceModalRef} on:saved={load} />

{#if showA4Receipt}
  <RentInvoiceA4ReceiptModal invoice={selectedA4Invoice} on:close={() => (showA4Receipt = false)} />
{/if}

<style>
	.cursor-pointer { cursor: pointer; }
	.pagination-circle .page-link { border-radius: 50% !important; margin-left: 3px; margin-right: 3px; border: none; }
</style>
