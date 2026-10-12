module.exports = function createAuthRepository(pool) {
  async function access(id, executor = pool) {
    const [accounts] = await executor.execute(
      'SELECT id, display_name, is_active, auth_version FROM platform_admin_accounts WHERE id = ?', [id],
    );
    if (!accounts.length) return null;
    const [permissions] = await executor.execute(`
      SELECT DISTINCT p.code FROM platform_admin_account_roles ar
      JOIN platform_admin_roles r ON r.id = ar.role_id AND r.is_active = 1
      JOIN platform_admin_role_permissions rp ON rp.role_id = r.id
      JOIN platform_admin_permissions p ON p.id = rp.permission_id
      WHERE ar.account_id = ? ORDER BY p.code`, [id]);
    return { ...accounts[0], permissions: permissions.map(row => row.code) };
  }
  async function transaction(work) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }
  return {
    access, transaction,
    async ready() {
      await pool.query(`SELECT a.id FROM platform_admin_accounts a
        JOIN platform_admin_roles r ON 1=0 JOIN platform_admin_permissions p ON 1=0
        JOIN platform_admin_account_roles ar ON 1=0 JOIN platform_admin_role_permissions rp ON 1=0
        JOIN platform_admin_audit au ON 1=0 JOIN platform_admin_login_limits ll ON 1=0
        JOIN sessions s ON 1=0 LIMIT 0`);
    },
    async findCredentials(username) {
      const [rows] = await pool.execute('SELECT id, password_hash FROM platform_admin_accounts WHERE username = ?', [username]);
      return rows[0] || null;
    },
    async audit(event, executor = pool) {
      await executor.execute(`INSERT INTO platform_admin_audit
        (actor_admin_id, target_admin_id, event, outcome, origin, subject_hash, detail_code)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [event.actorId ?? null, event.targetId ?? null,
        event.event, event.outcome, event.origin, event.subjectHash ?? null, event.detailCode ?? null]);
    },
    async consumeLimits(buckets) {
      return transaction(async connection => {
        let allowed = true;
        // Consistent locking order prevents deadlocks across shared IP/account buckets.
        for (const bucket of [...buckets].sort((a, b) => a.key.localeCompare(b.key))) {
          await connection.execute(`INSERT INTO platform_admin_login_limits (bucket_key, window_start, attempts)
            VALUES (?, NOW(3), 1) ON DUPLICATE KEY UPDATE
            attempts = IF(window_start <= DATE_SUB(NOW(3), INTERVAL 15 MINUTE), 1, LEAST(attempts + 1, 100000)),
            window_start = IF(window_start <= DATE_SUB(NOW(3), INTERVAL 15 MINUTE), NOW(3), window_start)`, [bucket.key]);
          const [rows] = await connection.execute('SELECT attempts FROM platform_admin_login_limits WHERE bucket_key = ?', [bucket.key]);
          if (Number(rows[0].attempts) > bucket.maximum) allowed = false;
        }
        return allowed;
      });
    },
    async ensurePolicy(connection) {
      const [existing] = await connection.execute('SELECT id, is_active FROM platform_admin_roles WHERE code = ?', ['platform_administrator']);
      if (!existing.length) {
        await connection.execute('INSERT INTO platform_admin_roles (code) VALUES (?)', ['platform_administrator']);
        await connection.execute('INSERT INTO platform_admin_permissions (code) VALUES (?) ON DUPLICATE KEY UPDATE code = VALUES(code)', ['overview.read']);
        await connection.execute(`INSERT INTO platform_admin_role_permissions (role_id, permission_id)
          SELECT r.id, p.id FROM platform_admin_roles r, platform_admin_permissions p
          WHERE r.code = ? AND p.code = ?`, ['platform_administrator', 'overview.read']);
      }
      const [roles] = await connection.execute(`SELECT r.id FROM platform_admin_roles r
        JOIN platform_admin_role_permissions rp ON rp.role_id = r.id
        JOIN platform_admin_permissions p ON p.id = rp.permission_id
        WHERE r.code = ? AND r.is_active = 1 AND p.code = ?`, ['platform_administrator', 'overview.read']);
      if (!roles.length) throw new Error('INITIAL_POLICY_UNAVAILABLE');
      return roles[0].id;
    },
    async createAccount(connection, { username, displayName, hash }, roleId) {
      const [result] = await connection.execute('INSERT INTO platform_admin_accounts (username, display_name, password_hash) VALUES (?, ?, ?)', [username, displayName, hash]);
      await connection.execute('INSERT INTO platform_admin_account_roles (account_id, role_id) VALUES (?, ?)', [result.insertId, roleId]);
      return result.insertId;
    },
    async changeAccess(connection, username, change, value) {
      const [rows] = await connection.execute('SELECT id FROM platform_admin_accounts WHERE username = ? FOR UPDATE', [username]);
      if (!rows.length) throw new Error('ACCOUNT_NOT_FOUND');
      const id = rows[0].id;
      if (change === 'active') {
        await connection.execute('UPDATE platform_admin_accounts SET is_active = ?, auth_version = auth_version + 1 WHERE id = ?', [value ? 1 : 0, id]);
      } else {
        const [roles] = await connection.execute('SELECT id FROM platform_admin_roles WHERE code = ?', ['platform_administrator']);
        if (!roles.length) throw new Error('INITIAL_POLICY_UNAVAILABLE');
        if (value) await connection.execute('INSERT IGNORE INTO platform_admin_account_roles (account_id, role_id) VALUES (?, ?)', [id, roles[0].id]);
        else await connection.execute('DELETE FROM platform_admin_account_roles WHERE account_id = ? AND role_id = ?', [id, roles[0].id]);
        await connection.execute('UPDATE platform_admin_accounts SET auth_version = auth_version + 1 WHERE id = ?', [id]);
      }
      return id;
    },
  };
};
