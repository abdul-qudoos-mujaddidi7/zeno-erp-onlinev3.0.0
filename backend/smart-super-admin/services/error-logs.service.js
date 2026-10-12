module.exports = (db) => ({
  list: (params, query) =>
    db.list("error_logs", params, { log_type: query.type, $search: query.q }),
  detail: (table, id) => {
    if (table !== "error_logs") db.fail("Unknown log table", 404);
    return db.one(table, id);
  },
  async clear(action) {
    if (action === "clear_all_logs")
      await db.pool.execute("DELETE FROM error_logs");
    else if (action === "clear_only_logs")
      await db.pool.execute("DELETE FROM error_logs WHERE log_type='log'");
    else db.fail("Unknown log action");
  },
});
