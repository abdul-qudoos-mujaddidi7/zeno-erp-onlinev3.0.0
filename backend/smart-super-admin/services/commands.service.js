module.exports = (db) => ({
  list: (params, query) =>
    db.list("commands", params, {
      command_status: query.status,
      $search: query.q,
    }),
  async detail(identifier, orgId) {
    const commandId = db.id(identifier, true);
    return commandId
      ? db.one("commands", identifier)
      : {
          id: 0,
          org_id: orgId,
          selector: "tab_ses_id",
          script: "console.log('Hello World');\nreturn 'Hello world';",
          command_status: "new",
        };
  },
  async execute(body, userName) {
    const script = db.text(body.script, 1000000);
    if (!script) db.fail("Script is required");
    const org = body.org_id ? db.id(body.org_id, true) || null : null,
      user = body.user_id ? db.id(body.user_id, true) || null : null;
    if (org) await db.one("organizations", org);
    const selector = db.text(body.selector || "tab_ses_id", 50);
    const tab = db.text(body.tab_ses_id, 50);
    if (selector === "tab_ses_id" && !tab)
      db.fail("Tab session ID is required");
    const [result] = await db.pool.execute(
      `INSERT INTO commands (org_id,user_id,user_name,token,tab_ses_id,selector,command_status,script,status,created_at)
      VALUES (?,?,?,'',?,?,'pending',?,1,UTC_TIMESTAMP(3))`,
      [org, user, userName, tab, selector, script],
    );
    return result.insertId;
  },
  async result(identifier) {
    const record = await db.one("commands", identifier);
    return {
      id: record.id,
      command_status: record.command_status,
      answer: record.answer,
      answer_type: record.answer_type,
    };
  },
});
