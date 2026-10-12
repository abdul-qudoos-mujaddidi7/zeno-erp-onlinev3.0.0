const validators = require('../validators/organizations');
function invalid() { return Object.assign(new Error('INVALID_ORGANIZATION_REQUEST'), { status: 400 }); }
function absent() { return Object.assign(new Error('ORGANIZATION_NOT_FOUND'), { status: 404 }); }
const url = filters => '/superadmin/organizations?' + new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
function statusLabel(value, labels) { return value === null || value === undefined ? labels.unspecified : Number(value) === 1 ? labels.enabled : Number(value) === 0 ? labels.disabled : String(value); }
const decorate = (row, labels, selectedId) => ({ ...row, typeLabel: row.type || labels.unspecified, codeLabel: row.code || '—',
  statusLabel: statusLabel(row.status, labels), selected: row.id === selectedId, detailUrl: '/superadmin/organizations/' + row.id });

module.exports = repository => ({
  async list(query, labels, selectedId) {
    const parsed = validators.list.safeParse(query); if (!parsed.success) throw invalid();
    const filters = parsed.data;
    const result = await repository.list(filters);
    if (filters.type && filters.type !== '__none__' && !result.types.includes(filters.type)) result.types.push(filters.type);
    const current = { ...filters, page: result.page };
    return {
      title: labels.organizations, organizationsActive: true, filters: current,
      rows: result.rows.map(row => decorate(row, labels, selectedId)), total: result.total, page: result.page, totalPages: result.totalPages,
      previousUrl: result.page > 1 ? url({ ...current, page: result.page - 1 }) : null,
      nextUrl: result.page < result.totalPages ? url({ ...current, page: result.page + 1 }) : null,
      pageSizes: [10, 25, 50, 100].map(value => ({ value, selected: value === filters.pageSize })),
      typeOptions: [{ value: '', label: labels.allTypes }, { value: '__none__', label: labels.unspecified }, ...result.types.map(value => ({ value, label: value }))].map(option => ({ ...option, selected: option.value === filters.type })),
      statusOptions: [{ value: 'all', label: labels.allStatuses }, { value: '1', label: labels.enabled }, { value: '0', label: labels.disabled }].map(option => ({ ...option, selected: option.value === filters.status })),
      inventoryOptions: ['all', 'CLASSIC', 'FIFO', 'LIFO'].map(value => ({ value, label: value === 'all' ? labels.allMethods : value, selected: value === filters.inventory })),
      sorts: ['id', 'name', 'type', 'status', 'created_at'].map(value => ({ value, label: ({ id: labels.identifier, name: labels.organizationName, type: labels.organizationType, status: labels.status, created_at: labels.created })[value], selected: value === filters.sort })),
      directions: [{ value: 'asc', label: labels.ascending }, { value: 'desc', label: labels.descending }].map(option => ({ ...option, selected: option.value === filters.dir })),
    };
  },
  async detail(rawId, labels, selectedId) {
    const parsed = validators.id.safeParse(rawId); if (!parsed.success) throw invalid();
    const row = await repository.find(parsed.data); if (!row) throw absent();
    const counts = await repository.counts(row.id);
    return { title: row.name, organizationsActive: true, organization: decorate(row, labels, selectedId),
      counts: counts.map(count => ({ label: labels[count.category], total: count.total })) };
  },
  async select(body) {
    const parsed = validators.selection.safeParse(body); if (!parsed.success) throw invalid();
    if (parsed.data.organizationId === 'all') return null;
    const row = await repository.find(parsed.data.organizationId); if (!row) throw absent();
    return row.id;
  },
});
