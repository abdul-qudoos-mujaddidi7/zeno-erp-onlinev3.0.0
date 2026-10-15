require("dotenv").config();

const express = require("express");
const app = express();
const path = require("path");
const multer = require("multer");
const fs = require("fs");

const apiV2Routes = require("./routes/v2");
const auth = require("./middleware/auth");
const requireModulePermission = require("./middleware/permission");
const stockAdjustmentRoutes = require("./routes/v2/stock-adjustment.routes");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const compression = require("compression");
const errorLogInbox = require("./services/error-log-inbox");

app.use(compression());

const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);

const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASSWORD;
const dbHost = process.env.DB_HOST || "localhost";

app.use(express.json({ limit: "50mb" }));

const sessionStore = new MySQLStore({
  host: dbHost,
  user: dbUser,
  password: dbPass,
  database: dbName,
});
app.use(
  session({
    key: "erp_session",
    secret: process.env.SESSION_SECRET,
    store: sessionStore, // ✅ THIS FIXES YOUR PROBLEM
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

// 🔥 Manual CORS Middleware
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://online.zenoerp.com",
    "https://beta.zenoerp.com",
    "http://localhost:5173",
    "http://localhost:5173/",
    "http://localhost:5174",
    "http://localhost:5174/",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5173/",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5174/",
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  // res.header('Access-Control-Allow-Origin', 'https://beta-app.tectors.com'); // your frontend
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});
// Serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/*
 * Static delivery of the built frontend.
 *
 * express.static defaults to `Cache-Control: public, max-age=0`, which makes
 * the browser revalidate every chunk on every page load: a full round trip
 * per asset for files whose names already change when their content does.
 * The rules below give each kind of file the caching it can safely have.
 *
 *   assets/*            content-hashed by the build -> a year, immutable
 *   css|js|fonts|img/*  stable names, replaced on deploy -> an hour
 *   the app shell       never cached, so a deploy is picked up at once
 */
const HASHED_ASSET_PATTERN =
  /\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg)$/;
const STABLE_STATIC_PATTERN = /\/(?:css|js|fonts|img)\//;

function setStaticCacheHeaders(res, filePath) {
  const normalized = String(filePath).replace(/\\/g, "/");

  if (HASHED_ASSET_PATTERN.test(normalized)) {
    res.setHeader(
      "Cache-Control",
      "public, max-age=31536000, immutable",
    );
    return;
  }

  if (STABLE_STATIC_PATTERN.test(normalized)) {
    res.setHeader("Cache-Control", "public, max-age=3600");
    return;
  }

  // index.html and the service worker: always revalidated, never pinned.
  res.setHeader("Cache-Control", "no-cache");
}

app.use(
  "/",
  express.static(path.join(__dirname, "public"), {
    setHeaders: setStaticCacheHeaders,
  }),
);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/user", require("./routes/user"));
app.use("/api/superadmin", require("./routes/components/superadmin"));
// Smart Super Admin uses the existing legacy Super Admin session, but applies
// its own privilege and same-origin checks before exposing management routes.
app.use("/smart-super-admin", require("./smart-super-admin/app")());

// New fully-online API. Existing routes remain active during migration.
app.use("/api/v2", apiV2Routes);
// Compatibility endpoint for integrations that use the non-versioned REST path.
app.use(
  "/api/stock-adjustments",
  auth,
  requireModulePermission("Products", {
    read: ["Sales", "Purchases", "POS", "Services", "Accounts", "Dashboard"],
    write: ["Sales", "Purchases", "Services"],
  }),
  stockAdjustmentRoutes,
);

app.get("/api/server-time", (req, res) => {
  res.json({
    server_time: new Date().toISOString(),
  });
});

const { spawn } = require("child_process");

app.use(express.urlencoded({ extended: true }));
app.get("/backupme2020", async (req, res) => {
  try {
    res.send(/*html*/ `
      <form method='post'>
        <input type='password' name='password' />
        <button type='submit'>Download Backup</button>
      </form>
      
      `);
  } catch (err) {
    console.error("BACKUP ERROR:", err);
    res.status(500).json({ message: "Backup failed", error: err.message });
  }
});

app.post("/backupme2020", async (req, res) => {
  try {
    const { password } = req.body;

    // Check against server secret
    if (!password || password !== "me@2020") {
      return res.status(403).json({ message: "Unauthorized: wrong password" });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `backup_${dbName}_${timestamp}.sql.gz`;

    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

    // Spawn mysqldump
    const dump = spawn("mysqldump", [
      "-h",
      dbHost,
      "-u",
      dbUser,
      `-p${dbPass}`,
      dbName,
    ]);

    // Spawn gzip
    const gzip = spawn("gzip");

    // Pipe dump -> gzip -> response
    dump.stdout.pipe(gzip.stdin);
    gzip.stdout.pipe(res);

    // Handle errors
    dump.stderr.on("data", (data) => {
      console.error("mysqldump error:", data.toString());
    });
    gzip.stderr.on("data", (data) => {
      console.error("gzip error:", data.toString());
    });

    dump.on("exit", (code) => {
      if (code !== 0) console.error("mysqldump exited with code", code);
    });
    gzip.on("exit", (code) => {
      if (code !== 0) console.error("gzip exited with code", code);
    });
  } catch (err) {
    console.error("BACKUP ERROR:", err);
    res.status(500).json({ message: "Backup failed", error: err.message });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "./backups";

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

app.post("/backup/upload", upload.single("file"), (req, res) => {
  try {
    res.json({
      success: true,
      file: req.file.filename,
    });
  } catch (err) {
    res.status(500).json({ error: "Upload failed" });
  }
});

const mysql = require("mysql2/promise");

const logPool = mysql.createPool({
  host: dbHost,
  user: dbUser,
  password: dbPass,
  database: dbName, // using your existing DB (zenook)
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const formatMySQLDate = (date) => {
  return date.toISOString().slice(0, 19).replace("T", " ");
};

const commandWaiters = new Map();

app.post(
  "/execute-command/",
  express.urlencoded({ extended: true }),
  async (req, res) => {
    if (req.session.user.username !== "superadmin") {
      return res
        .status(403)
        .send("Forbidden: Only superadmin can execute commands");
    }
    /*
     * The connection is taken only after validation and is released in
     * `finally`.
     *
     * Before this, `conn` was taken first and released on the happy path only:
     * an empty script returned early and any SQL error threw, and both paths
     * left the connection checked out with no way to get it back. `logPool` has
     * ten connections, so ten such requests took down every endpoint that uses
     * it - /logs, /command-executed and the command poll included.
     */
    const { org_id, user_id, tab_ses_id, selector, script } = req.body;

    // 🔒 basic validation
    if (!script || !script.trim()) {
      return res.send("Script is empty");
    }

    let conn;

    try {
      const user_name = req.session.user?.username || "unknown";
      const token = ""; // optional (you can generate if needed)
      const ip_address =
        req.headers["x-forwarded-for"] || req.socket.remoteAddress;

      conn = await logPool.getConnection();

      const query = `
        INSERT INTO commands 
        (org_id, user_id, user_name, token, ip_address, tab_ses_id, selector, command_status, script, status,created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        org_id || null,
        user_id || null,
        user_name,
        token,
        ip_address,
        tab_ses_id || null,
        selector || null,
        "pending", // command_status
        script,
        1,
        formatMySQLDate(new Date()),
      ];

      const [result] = await conn.execute(query, values);

      // get inserted command id
      const commandId = result.insertId;

      const key = `${tab_ses_id}`;

      if (commandWaiters.has(key)) {
        const resolve = commandWaiters.get(key);
        commandWaiters.delete(key);
        await conn.execute(
          `UPDATE commands SET command_status = 'sent' WHERE id = ?`,
          [commandId],
        );

        resolve({
          id: commandId,
          org_id,
          user_id,
          tab_ses_id,
          selector,
          script,
          command_status: "sent",
        });
      }

      // ✅ respond with the created command id
      res.json({ success: true, id: commandId });
    } catch (err) {
      console.error("Error saving command:", err);
      res.status(500).send("Failed to save command");
    } finally {
      if (conn) conn.release();
    }
  },
);

app.get("/api/superadmin/command-wait/:id", async (req, res) => {
  const id = req.params.id;

  // check immediately first
  const [rows] = await logPool.execute(
    `SELECT command_status, answer, answer_type FROM commands WHERE id = ?`,
    [id]
  );

  if (rows.length && rows[0].command_status === 'executed') {
    return res.json(rows[0]);
  }

  // otherwise wait
  const timeout = setTimeout(() => {
    commandWaiters.delete(id);
    res.json({ timeout: true });
  }, 30000); // 30s max wait

  commandWaiters.set(id, (data) => {
    clearTimeout(timeout);
    res.json(data);
  });
});

app.post("/command-executed", express.json(), async (req, res) => {
  try {
    const { command_id, answer, answer_type } = req.body;

    if (!command_id) {
      return res.status(400).json({ error: "Missing command_id" });
    }

    /*
     * Released in `finally`: a failed UPDATE used to leave the connection
     * checked out, and this route is the one every tab calls after executing a
     * command, so the leak accumulated under exactly the load that made the
     * command channel look broken.
     */
    const conn = await logPool.getConnection();

    try {
      await conn.execute(
        `UPDATE commands 
         SET command_status = 'executed', answer = ?, answer_type = ? 
         WHERE id = ?`,
        [answer || "", answer_type || "text", command_id]
      );
    } finally {
      conn.release();
    }

    // 🔥 REAL-TIME PUSH HERE
    if (commandWaiters.has(String(command_id))) {
      const resolve = commandWaiters.get(String(command_id));
      commandWaiters.delete(String(command_id));

      resolve({
        command_status: 'executed',
        answer,
        answer_type
      });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Error updating command:", err);
    res.status(500).json({ error: "Failed to update command" });
  }
});

/*
 * Claim a command for this tab, if one is waiting.
 *
 * The connection is released in `finally`: the old code released it on the
 * happy path only, so a failed UPDATE kept a pooled connection forever.
 */
async function claimPendingCommand(tabSesID) {
  const conn = await logPool.getConnection();

  try {
    const [rows] = await conn.execute(
      `SELECT * FROM commands 
       WHERE selector = ? 
       AND tab_ses_id = ? 
       AND command_status IN ('pending','sent')
       ORDER BY id ASC 
       LIMIT 1`,
      ["tab_ses_id", tabSesID],
    );

    if (rows.length === 0) return null;

    const command = rows[0];

    await conn.execute(
      `UPDATE commands SET command_status = 'sent' WHERE id = ?`,
      [command.id],
    );

    return command;
  } finally {
    conn.release();
  }
}

/*
 * Wait for a command to be raised for this tab while writing logs.
 *
 * Deliberately holds no database connection: this used to keep one of the ten
 * `logPool` connections for the whole ten seconds of every poll, from every
 * open tab, which is what starved the pool. A connection is taken again only
 * when a command actually arrives.
 */
function waitForCommand(tabSesID, waitMs = 10000) {
  return new Promise((resolve) => {
    const key = `${tabSesID}`;

    const timeout = setTimeout(() => {
      commandWaiters.delete(key);
      resolve(null);
    }, waitMs);

    commandWaiters.set(key, (cmd) => {
      clearTimeout(timeout);
      resolve(cmd);
    });
  });
}

app.post("/logs", async (req, res) => {
  try {
    const {
      logs,
      system,
      org_id,
      user_id,
      user_name,
      token,
      tabSesID,
      timestamp,
    } = req.body;

    if (!Array.isArray(logs)) {
      return res.status(400).json({ error: "Invalid logs format" });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      req.ip;

    /*
     * One INSERT for the whole batch, on a connection that is given back
     * before the command poll below starts. See services/error-log-inbox.js
     * for why the batch and the per-line limits exist.
     */
    const { rows, dropped } = errorLogInbox.normaliseBatch(logs, {
      ip,
      orgId: org_id,
      userId: user_id,
      userName: user_name,
      token,
      tabSesId: tabSesID,
      system,
      createdAt: formatMySQLDate(
        timestamp ? new Date(timestamp) : new Date(),
      ),
    });

    const inserted = await errorLogInbox.insertLogs(logPool, rows);

    const command = await claimPendingCommand(tabSesID);

    if (command) {
      return res.json({ success: true, inserted, command });
    }

    const result = await waitForCommand(tabSesID);

    if (result) {
      return res.json({
        success: true,
        inserted,
        command: result,
      });
    }

    return res.json({
      success: true,
      inserted,
      ...(dropped ? { dropped } : {}),
      timeout: true,
    });
  } catch (err) {
    console.error("LOGGING ERROR:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// These must remain after every route.
app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT || 3001);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
