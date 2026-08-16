<script>
	import { onMount, onDestroy } from 'svelte';
	import { meterReadingApi } from '../../api/meterReadingApi.js';
	import { utilityMeterApi } from '../../api/utilityMeterApi.js';
	import { leaseApi } from '../../api/leaseApi.js';
	import { t, shortID } from '../../i18n/i18n.js';
	import { DEFAULT_PAGE_SIZE, readListMeta } from '../../lib/pagination.js';

	let mode = 'list';
	let meter_readings = [];
	let loading = true;
	let meters = [];
	let leases = [];
	let lookupsLoaded = false;

	import MeterReadingModal from './MeterReadingModal.svelte';
	import MeterReadingA4ReceiptModal from './MeterReadingA4ReceiptModal.svelte';

	let showA4Receipt = false;
	let selectedA4MeterReading = null;
	let meter_readingModalRef = null;

	let filterMeter = 'all';
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

	export let account_id = null;

	async function loadLookups() {
		if (lookupsLoaded) return;
		try {
			const [meterRes, leaseRes] = await Promise.all([
				utilityMeterApi.getAll({ status: 1 }),
				leaseApi.getAll({ status: 1 }),
			]);
			meters = meterRes?.data || [];
			leases = leaseRes?.data || [];
			lookupsLoaded = true;
		} catch (err) {
			console.error('Failed to load meters/leases:', err);
			meters = [];
			leases = [];
		}
	}

	function pageKey() {
		return `${currentPage}|${itemsPerPage}|${filterMeter}|${account_id || ''}`;
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
			if (filterMeter !== 'all') query.meter_id = filterMeter;

			const response = await meterReadingApi.getAll(query);
			if (requestId !== loadRequestId) return;

			let rows = response?.data || [];
			const meta = readListMeta(response, rows.length);

			if (account_id) {
				const account_leases = leases.filter(
					(l) => l.tenant_account_id === parseInt(account_id),
				);
				const account_meters = meters.filter((m) =>
					account_leases.find((l) => l.apartment_id === m.apartment_id),
				);
				const meterIds = new Set(account_meters.map((m) => m.id));
				rows = rows.filter((p) => p.meter_id && meterIds.has(p.meter_id));
				totalItems = rows.length;
				totalPages = Math.ceil(totalItems / itemsPerPage) || 0;
			} else {
				totalItems = meta.total;
				totalPages = meta.totalPages || Math.ceil(totalItems / itemsPerPage) || 0;
			}

			meter_readings = rows;
		} catch (err) {
			console.error('Failed to load meter readings:', err);
			if (requestId === loadRequestId) {
				meter_readings = [];
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
		void filterMeter;
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
		let res = meter_readings.slice();
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
							placeholder={t('Search meter_readings...')}
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
							value={filterMeter}
							on:change={(e) => {
								filterMeter = e.currentTarget.value;
								onFilterChange();
							}}
						>
						<option value="all">{t('All')+' '+t('Meters')}</option>
						{#each meters as meter}
							<option value={meter.id}>{t("Meter")}: {meter.meter_number}</option>
						{/each}
						</select>
					</div>
					<div class="col-md-4 text-end">
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
						<button class="btn btn-primary w-100" on:click={()=>{meter_readingModalRef?.openMeterReadingModal()}}><i class="bi bi-plus-circle me-2"></i>{t('New Meter Reading')}</button>
					</div>
				</div>
			</div>

			<div class="card-body p-0">
				<div class="table-responsive">
					<table class="table table-hover table-sm align-middle">
						<thead class="table-light">
							<tr>
								<th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>{t('ID')}{#if sortColumn === 'id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('meter_id')}>{t('Meter')}{#if sortColumn === 'meter_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th><th class="text-center cursor-pointer" on:click={() => setSort('previous_reading')}>{t('Previous Reading')}{#if sortColumn === 'previous_reading'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('current_reading')}>{t('Current Reading')}{#if sortColumn === 'current_reading'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('consumption')}>{t('Consumption')}{#if sortColumn === 'consumption'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
								<th class="text-center cursor-pointer" on:click={() => setSort('reading_date')}>{t('Reading Date')}{#if sortColumn === 'reading_date'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('rate_per_unit')}>{t('Rate Per Unit')}{#if sortColumn === 'rate_per_unit'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
				  <th class="text-center cursor-pointer" on:click={() => setSort('calculated_amount')}>{t('Calculated Amount')}{#if sortColumn === 'calculated_amount'}<i
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
                                    <td class="text-center">{meters.find(b => b.id === w.meter_id)?.meter_number || ''}</td>
                                    <td class="text-center">{w.previous_reading}</td>
                                    <td class="text-center">{w.current_reading}</td>
                                    <td class="text-center">{w.consumption}</td>
                                    <td class="text-center">{w.reading_date}</td>
                                    <td class="text-center">{Number(w.rate_per_unit || 0).toLocaleString(undefined,{maximumFractionDigits: 3})} {t(w.currency)}</td>
                                    <td class="text-center">{Number(w.calculated_amount || 0).toLocaleString(undefined,{maximumFractionDigits: 3})} {t(w.currency)}</td>
									<td class="text-center" dir='ltr'>{w.created_at ? new Date(w.created_at).toLocaleString() : ''}</td>
									<td class="text-center">
                                          <button class="btn btn-sm btn-outline-secondary me-1" on:click={() =>
                                                        meter_readingModalRef?.editMeterReading(
                                                            w,
                                                        )}
                                                >
                                                    <i class="bi bi-pencil"></i>
											</button>
										<button
											on:click={() => {
											selectedA4MeterReading = w;
											showA4Receipt = true;
											}}
											class="btn btn-outline-primary btn-sm me-2 px-2">
											<i class="bi bi-printer"></i>
										</button>
									</td>
								</tr>
							{/each}
							{#if filtered.length === 0}
								<tr><td colspan="12" class="text-center text-muted p-4">{t('No meter_readings found.')}</td></tr>
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


<MeterReadingModal bind:this={meter_readingModalRef} on:saved={load} />

{#if showA4Receipt}
  <MeterReadingA4ReceiptModal meter_reading={selectedA4MeterReading} on:close={() => (showA4Receipt = false)} />
{/if}
<style>
	.cursor-pointer { cursor: pointer; }
	.pagination-circle .page-link { border-radius: 50% !important; margin-left: 3px; margin-right: 3px; border: none; }
</style>
