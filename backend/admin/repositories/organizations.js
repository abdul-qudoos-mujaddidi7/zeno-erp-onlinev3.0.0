const SORTS = Object.freeze({ id: 'o.id', name: 'o.name', type: 'o.type', status: 'o.status', created_at: 'o.created_at' });
const COUNTS = Object.freeze(['products', 'sales', 'purchases', 'journals', 'accounts', 'users', 'warehouses', 'activity_logs']);
const COLUMNS = 'o.id, o.name, o.code, o.type, o.inventory_method, o.status, o.created_at, o.updated_at';

module.exports = pool => ({
  async find(id) {
    const [rows] = await pool.execute(`SELECT ${COLUMNS} FROM organizations o WHERE o.id = ?`, [id]);
    return rows[0] || null;
  },
  async list(filters) {
    const conditions = [], values = [];
    if (filters.q) {
      const term = '%' + filters.q.replace(/[!%_]/g, character => '!' + character) + '%';
      conditions.push("(o.name LIKE ? ESCAPE '!' OR o.code LIKE ? ESCAPE '!')"); values.push(term, term);
    }
    if (filters.type === '__none__') conditions.push('o.type IS NULL');
    else if (filters.type) { conditions.push('o.type = ?'); values.push(filters.type); }
    if (filters.status !== 'all') { conditions.push('o.status = ?'); values.push(Number(filters.status)); }
    if (filters.inventory !== 'all') { conditions.push('o.inventory_method = ?'); values.push(filters.inventory); }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const [count] = await pool.execute('SELECT COUNT(*) AS total FROM organizations o' + where, values);
    const total = Number(count[0].total);
    const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
    const page = Math.min(filters.page, totalPages);
    const column = SORTS[filters.sort];
    if (!column || !['asc', 'desc'].includes(filters.dir)) throw new Error('INVALID_SORT');
    const direction = filters.dir === 'asc' ? 'ASC' : 'DESC';
    const [rows] = await pool.execute(`SELECT ${COLUMNS} FROM organizations o${where}
      ORDER BY ${column} ${direction}${filters.sort !== 'id' ? ', o.id ' + direction : ''} LIMIT ? OFFSET ?`,
    [...values, filters.pageSize, (page - 1) * filters.pageSize]);
    const [types] = await pool.execute('SELECT DISTINCT type FROM organizations WHERE type IS NOT NULL ORDER BY type LIMIT 200');
    return { rows, total, totalPages, page, types: types.map(row => row.type) };
  },
  async counts(id) {
    // Tables are fixed constants, never request-controlled identifiers. Only aggregate data leaves SQL.
    const [rows] = await pool.execute(COUNTS.map(table => `SELECT '${table}' AS category, COUNT(*) AS total FROM ${table} WHERE org_id = ? AND status <> 0`).join(' UNION ALL '), COUNTS.map(() => id));
    return rows.map(row => ({ category: row.category, total: Number(row.total) }));
  },
});
module.exports.COUNTS = COUNTS;
