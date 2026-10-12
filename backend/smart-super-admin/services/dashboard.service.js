module.exports = (db) => ({
  async index() {
    return db.list("organizations", {
      sortcolumn: "created_at",
      sortdir: "DESC",
      org: 0,
      limit: 20,
      page: 1,
    });
  },
  async select(orgId) {
    const id = db.id(orgId, true);
    if (id) await db.one("organizations", id);
    return id;
  },
  async options(query) {
    const term =
      "%" + db.text(query, 120).replace(/[!%_]/g, (c) => "!" + c) + "%";
    const [rows] = await db.pool.execute(
      "SELECT id,name FROM organizations WHERE name LIKE ? ESCAPE '!' OR CAST(id AS CHAR) LIKE ? ESCAPE '!' ORDER BY name LIMIT 20",
      [term, term],
    );
    return rows;
  },
});
