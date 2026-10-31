<script>
  import { onMount, onDestroy } from 'svelte';
import { departmentApi } from '../../api/departmentApi.js';
  import { resolveMediaUrl } from '../../lib/mediaUrl.js';
  import { t, lang, translate_org_type, shortID } from '../../i18n/i18n';
  import UserModal from './UserModal.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import TableSkeleton from '../../components/common/TableSkeleton.svelte';
import { userApi } from '../../api/userApi.js';
import { userRoleApi } from '../../api/userRoleApi.js';
import { userImageApi } from '../../api/userImageApi.js';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../../lib/pagination.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let users = [];
  let userRoles = [];
  let departments = [];
  let loading = true;
  let searchQuery = '';
  let selectedRole = 'all';
  let selectedDepartment = 'all';
  let selectedStatus = 'active';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';
  let showSummaryCards = false;
  let modalRef;
  let totalItems = 0;
  let totalPages = 0;
  let bootstrapped = false;
  let lastPageFilterKey = '';
  let searchDebounceTimer = null;
  let loadRequestId = 0;

  function pageFilterKey() {
    return `${currentPage}|${itemsPerPage}|${selectedRole}|${selectedDepartment}|${selectedStatus}`;
  }

  async function loadUserRoles() {
    const [active, inactive] = await Promise.all([
      userRoleApi.getAll({ status: 1 }),
      userRoleApi.getAll({ status: 0 }),
    ]);
    userRoles = [
      ...(active?.data || []),
      ...(inactive?.data || []),
    ];
  }

  async function loadDepartments() {
    departments = (await departmentApi.getAll({ status: 1 }))?.data || [];
  }

  async function loadUsers() {
    const requestId = ++loadRequestId;
    lastPageFilterKey = pageFilterKey();
    loading = true;
    try {
      const query = {
        page: currentPage,
        limit: itemsPerPage,
        search: searchQuery.trim(),
      };
      if (selectedStatus === 'active') query.status = 1;
      else if (selectedStatus === 'inactive') query.status = 0;
      if (selectedRole !== 'all') query.role_id = selectedRole;
      if (selectedDepartment !== 'all') query.department_id = selectedDepartment;

      const response = await userApi.getAll(query);
      if (requestId !== loadRequestId) return;

      users = response?.data || [];
      const meta = readListMeta(response, users.length);
      totalItems = meta.total;
      totalPages = meta.totalPages || Math.ceil(totalItems / itemsPerPage) || 0;

      /*
       * Images: one unpaginated fetch is OK for small orgs (backend has no
       * user_ids filter). It must never be able to take the list down with it —
       * a failure here used to fall through to the catch below, which blanks
       * every row and hides the pagination footer, so the page looked as if the
       * users had disappeared. A missing avatar is cosmetic; the rows are not.
       */
      try {
        const images =
          (await userImageApi.getAll({ status: 1 }))?.data || [];
        if (requestId !== loadRequestId) return;

        const imageByUserId = new Map(
          images.map((img) => [Number(img.user_id), img]),
        );

        for (const user of users) {
          const image = imageByUserId.get(Number(user.id));
          user.imageUrl = resolveMediaUrl(image?.image, null);
        }
        users = [...users];
      } catch (imageError) {
        console.error('Failed to load user images:', imageError);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
      if (requestId === loadRequestId) {
        users = [];
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
      else loadUsers();
    }, 300);
  }

  onMount(() => {
    loadUserRoles();
    loadDepartments();
    lastPageFilterKey = pageFilterKey();
    bootstrapped = true;
    loadUsers();
  });

  onDestroy(() => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  $: if (bootstrapped) {
    void currentPage;
    void itemsPerPage;
    void selectedRole;
    void selectedDepartment;
    void selectedStatus;
    const key = pageFilterKey();
    if (key !== lastPageFilterKey) {
      lastPageFilterKey = key;
      loadUsers();
    }
  }

  function openModal(user = null) {
    modalRef?.openModal(user);
  }

  function setSort(column) {
    if (sortColumn === column) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    else {
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

  function roleName(id) {
    return t(userRoles.find((role) => role.id === id)?.name || 'Unassigned');
  }

  function departmentName(id) {
    return t(departments.find((department) => department.id === id)?.name || 'Unassigned');
  }

  $: paginatedUsers = users.slice().sort((a, b) => {
    let left = sortColumn === 'role_id' ? roleName(a.role_id) : sortColumn === 'department_id' ? departmentName(a.department_id) : a[sortColumn];
    let right = sortColumn === 'role_id' ? roleName(b.role_id) : sortColumn === 'department_id' ? departmentName(b.department_id) : b[sortColumn];
    left = String(left ?? '').toLowerCase();
    right = String(right ?? '').toLowerCase();
    if (left === right) return 0;
    const result = left < right ? -1 : 1;
    return sortDirection === 'asc' ? result : -result;
  });

  $: activeCount = paginatedUsers.filter((user) => user.status === 1).length;
  $: inactiveCount = paginatedUsers.filter((user) => user.status !== 1).length;

  $: userFilters = [
    {
      key: 'role',
      label: t('Role'),
      value: selectedRole,
      icon: 'bi-person-gear',
      options: [
        { value: 'all', label: t('All Roles') },
        ...userRoles.filter((role) => role.status === 1).map((role) => ({ value: role.id, label: t(role.name) })),
      ],
    },
    {
      key: 'department',
      label: t('Department'),
      value: selectedDepartment,
      icon: 'bi-diagram-3',
      options: [
        { value: 'all', label: t('All Departments') },
        ...departments.filter((department) => department.status === 1).map((department) => ({ value: department.id, label: department.name })),
      ],
    },
    {
      key: 'status',
      label: t('Status'),
      value: selectedStatus,
      icon: 'bi-activity',
      options: [
        { value: 'all', label: t('All Statuses') },
        { value: 'active', label: t('Active') },
        { value: 'inactive', label: t('Inactive') },
      ],
    },
  ];

  function handleFilter(event) {
    const { key, value } = event.detail;
    if (key === 'role') selectedRole = value;
    if (key === 'department') selectedDepartment = value;
    if (key === 'status') selectedStatus = value;
    currentPage = 1;
  }

  function resetFilters() {
    searchQuery = '';
    selectedRole = 'all';
    selectedDepartment = 'all';
    selectedStatus = 'active';
    currentPage = 1;
    loadUsers();
  }
</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('User Management')}
  showStats={showSummaryCards}
  showFooter={!loading && totalItems > 0}
  dense={true}
  contained={true}
  contentClass="users-index-content"
  tablePadding={true}>
  <svelte:fragment slot="actions">
    <ActionButton icon="bi-person-plus" label={`+ ${t('Add User')}`} on:click={() => openModal()} />
    <button
      type="button"
      class="index-settings-button"
      class:is-active={showSummaryCards}
      aria-label={t('Summary')}
      aria-expanded={showSummaryCards}
      title={t('Summary')}
      on:click={() => (showSummaryCards = !showSummaryCards)}>
      <i class="bi {showSummaryCards ? 'bi-x-lg' : 'bi-people'}"></i>
    </button>
  </svelte:fragment>

  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchQuery}
      searchPlaceholder={t('Search by username, email, or name...')}
      filters={userFilters}
      filterLabel={t('Filter')}
      resetLabel={t('Clear Filters')}
      on:searchChange={(event) => { searchQuery = event.detail; scheduleSearchReload(); }}
      on:filterChange={handleFilter}
      on:reset={resetFilters} />
  </svelte:fragment>

  <svelte:fragment slot="stats">
    <div class="index-summary-grid">
      <SummaryCard label={t('Users')} icon="bi-people" tone="cyan">{totalItems}</SummaryCard>
      <SummaryCard label={t('Active')} icon="bi-person-check" tone="green">{activeCount}</SummaryCard>
      <SummaryCard label={t('Inactive')} icon="bi-person-dash" tone="amber">{inactiveCount}</SummaryCard>
      <SummaryCard label={t('User Roles')} icon="bi-person-gear" tone="purple">{userRoles.filter((role) => role.status === 1).length}</SummaryCard>
    </div>
  </svelte:fragment>

  {#if loading}
    <TableSkeleton ariaLabel={t('Loading...')} colCount={11} minWidth="1050px" />
  {:else if paginatedUsers.length === 0}
    <div class="index-table-state"><EmptyState icon="bi-people" message={t('No users found.')} /></div>
  {:else}
    <DataTable ariaLabel={t('Users')} minWidth="1050px" dense striped hover={false} stickyHeader layout="fixed" scrollbar="thin">
      <svelte:fragment slot="head">
        <tr>
          <th class="col-start">#</th>
          <th>{t('Image')}</th>
          <th class="col-start cursor-pointer" on:click={() => setSort('username')}>{t('Username')}</th>
          <th class="col-start cursor-pointer" on:click={() => setSort('first_name')}>{t('Name')}</th>
          <th class="col-start">{t('Email')}</th>
          <th>{t('Phone')}</th>
          <th class="cursor-pointer" on:click={() => setSort('role_id')}>{t('Role')}</th>
          <th class="cursor-pointer" on:click={() => setSort('department_id')}>{t('Department')}</th>
          <th>{t('Status')}</th>
          <th>{t('Created At')}</th>
          <th>{t('Actions')}</th>
        </tr>
      </svelte:fragment>

      {#each paginatedUsers as user, index (user.id)}
        <tr>
          <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
          <td><img class="user-avatar" src={user.imageUrl || '/img/no-image.png'} alt={user.first_name || user.username} /></td>
          <td class="col-start"><span class="username">{user.username}</span></td>
          <td class="col-start"><strong>{user.first_name} {user.last_name}</strong></td>
          <td class="col-start"><span class="email-cell">{user.email || '—'}</span></td>
          <td>{user.phone || '—'}</td>
          <td><StatusBadge tone="neutral" ghost>{roleName(user.role_id)}</StatusBadge></td>
          <td><StatusBadge tone="neutral" ghost>{departmentName(user.department_id)}</StatusBadge></td>
          <td><StatusBadge tone={user.status === 1 ? 'positive' : 'neutral'}>{user.status === 1 ? t('Active') : t('Inactive')}</StatusBadge></td>
          <td><span class="cell-muted" dir="ltr">{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</span></td>
          <td>
            <div class="visible-table-actions">
              <ActionButton variant="icon" tone="edit" icon="bi-pencil" title={t('Edit')} on:click={() => openModal(user)} />
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
      {totalItems}
      ariaLabel={t('Users pagination')}
      rowLabel={t('rows')}
      on:perPageChange={(event) => { itemsPerPage = Number(event.detail); currentPage = 1; }}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>

<UserModal bind:this={modalRef} userRoles={userRoles} departments={departments} on:saved={loadUsers} />

<style>
  .cursor-pointer { cursor: pointer; }
  .cell-muted { color: #7b8ba1; font-weight: 650; }
  .user-avatar { width: 2rem; height: 2rem; border: 2px solid #e9eef5; border-radius: 50%; object-fit: cover; }
  .username { color: #0f6efd; font-weight: 800; }
  .email-cell { display: block; overflow: hidden; color: #64748b; text-overflow: ellipsis; white-space: nowrap; }
  .visible-table-actions { display: inline-flex; align-items: center; justify-content: center; }
  .visible-table-actions :global(.action-btn.icon),
  .visible-table-actions :global(.action-btn.icon:hover:not(:disabled)) {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }
</style>
