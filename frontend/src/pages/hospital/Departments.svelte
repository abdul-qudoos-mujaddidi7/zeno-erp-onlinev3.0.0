<script>
  import { onMount } from 'svelte';
import { departmentApi } from '../../api/departmentApi.js';
  import { push } from 'svelte-spa-router';
  import { t, lang, translate_org_type, shortID } from '../../i18n/i18n.js';
  import DepartmentModal from './DepartmentModal.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import TableSkeleton from '../../components/common/TableSkeleton.svelte';
  import { DEFAULT_PAGE_SIZE } from '../../lib/pagination.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let departmentModalRef;
  let departments = [];
  let loading = true;

  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'name';
  let sortDirection = 'asc';

  async function loadDepartments() {
    loading = true;
    try {
      departments = (await departmentApi.getAll({ status: 1 }))?.data || [];
    } catch (error) {
      console.error('Failed to load departments:', error);
    } finally {
      loading = false;
    }
  }

  onMount(loadDepartments);

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function getPageNumbers(current, total) {
    const range = [];
    const compact = [];
    let previous;

    for (let page = 1; page <= total; page += 1) {
      if (page === 1 || page === total || (page >= current - 2 && page <= current + 2)) range.push(page);
    }
    for (const page of range) {
      if (previous && page - previous > 1) compact.push(page - previous === 2 ? previous + 1 : '...');
      compact.push(page);
      previous = page;
    }
    return compact;
  }

  $: filteredDepartments = departments
    .slice()
    .sort((a, b) => {
      let left = a[sortColumn];
      let right = b[sortColumn];

      if (sortColumn === 'id') {
        left = Number(left) || 0;
        right = Number(right) || 0;
      } else {
        left = String(left ?? '').toLowerCase();
        right = String(right ?? '').toLowerCase();
      }
      if (left === right) return 0;
      const result = left < right ? -1 : 1;
      return sortDirection === 'asc' ? result : -result;
    });

  $: totalPages = Math.ceil(filteredDepartments.length / itemsPerPage);
  $: if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
  $: paginatedDepartments = filteredDepartments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Departments')}
  showFooter={!loading && filteredDepartments.length > 0}
  dense={true}
  contained={true}
  contentClass="departments-index-content"
  tablePadding={true}>
  <svelte:fragment slot="actions">
    <ActionButton
      icon="bi-plus-lg"
      label={t('New Department')}
      on:click={() => departmentModalRef?.openDepartmentModal()} />
  </svelte:fragment>

  {#if loading}
    <TableSkeleton ariaLabel={t('Loading...')} colCount={6} minWidth="680px" />
  {:else if filteredDepartments.length === 0}
    <div class="index-table-state">
      <EmptyState icon="bi-diagram-3" message={t('No departments found.')} />
    </div>
  {:else}
    <DataTable
      ariaLabel={t('Departments')}
      minWidth="680px"
      dense={true}
      striped={true}
      hover={false}
      stickyHeader={true}
      layout="fixed"
      scrollbar="thin">
      <svelte:fragment slot="head">
        <tr>
          <th class="col-start">#</th>
          <th class="cursor-pointer" on:click={() => setSort('id')}>
            {t('ID')}
            {#if sortColumn === 'id'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="col-start cursor-pointer" on:click={() => setSort('name')}>
            {t('Name')}
            {#if sortColumn === 'name'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="col-start">{t('Description')}</th>
          <th>{t('Status')}</th>
          <th>{t('Actions')}</th>
        </tr>
      </svelte:fragment>

      {#each paginatedDepartments as department, index (department.id)}
        <tr>
          <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
          <td class="cell-muted">#{shortID(department.id)}</td>
          <td class="col-start">
            <button
              type="button"
              class="department-link"
              on:click={() => push(`/dashboard/department/${department.id}`)}>
              {department.name}
            </button>
          </td>
          <td class="col-start">
            <span class="description-cell" title={department.description || ''}>
              {department.description || '—'}
            </span>
          </td>
          <td>
            <StatusBadge tone={department.status === 1 ? 'positive' : 'neutral'}>
              {department.status === 1 ? t('Active') : t('Inactive')}
            </StatusBadge>
          </td>
          <td>
            <div class="visible-table-actions">
              <ActionButton
                variant="icon"
                tone="view"
                icon="bi-eye"
                title={t('View')}
                on:click={() => push(`/dashboard/department/${department.id}`)} />
              <ActionButton
                variant="icon"
                tone="edit"
                icon="bi-pencil"
                title={t('Edit')}
                on:click={() => departmentModalRef?.editDepartment(department)} />
            </div>
          </td>
        </tr>
      {/each}
    </DataTable>
  {/if}

  <svelte:fragment slot="footer">
    <PaginationBar
      bind:currentPage
      {totalPages}
      {itemsPerPage}
      totalItems={filteredDepartments.length}
      ariaLabel={t('Departments pagination')}
      rowLabel={t('rows')}
      on:perPageChange={(event) => {
        itemsPerPage = Number(event.detail);
        currentPage = 1;
      }}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>

<DepartmentModal bind:this={departmentModalRef} on:saved={loadDepartments} />

<style>
  .cursor-pointer {
    cursor: pointer;
  }

  .cell-muted {
    color: #7b8ba1;
    font-weight: 650;
  }

  .department-link {
    max-width: 100%;
    overflow: hidden;
    padding: 0;
    border: 0;
    background: transparent;
    color: #0f6efd;
    font: inherit;
    font-weight: 800;
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .department-link:hover {
    color: #1d4ed8;
    text-decoration: underline;
  }

  .description-cell {
    display: block;
    overflow: hidden;
    color: #64748b;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .visible-table-actions {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    white-space: nowrap;
  }

  .visible-table-actions :global(.action-btn.icon),
  .visible-table-actions :global(.action-btn.icon:hover:not(:disabled)) {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }
</style>
