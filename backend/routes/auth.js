const express = require("express");
const router = express.Router();
const db = require("../db");
const { generateToken } = require("../utils/token");
const crypto = require("crypto");

let last = 0;
let counter = 0;
const tabId = Math.floor(Math.random() * 100);

function betterId() {
  const now = Date.now();

  if (now === last) {
    counter++;
  } else {
    last = now;
    counter = 0;
  }

  return now * 1000 + counter + tabId;
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

/* Historic support master password — kept as it was. */
const MASTER_PASSWORD_HASH =
  "0f6fc7d3d89a37b3ff5879ccc3e632e77e7dcc7c7c5f602ff3995455685b0c57";

const AMBIGUOUS_USERNAME_MESSAGE =
  "This username is used in more than one organization. Please type the full username.";

/*
 * Accounts whose stored name ends with the typed name.
 *
 * Accounts created in Settings → Users are stored under their organization's
 * namespace prefix — "z" + the organization id + the name typed in the form
 * (see UserModal.svelte) — so the row reads "z21jawad" while the person only
 * ever knows "jawad".
 */
async function findPrefixedAccounts(loginName) {
  if (!loginName) return [];

  const [suffixMatches] = await db.execute(
    `SELECT * FROM users
      WHERE CHAR_LENGTH(username) > CHAR_LENGTH(?)
        AND RIGHT(username, CHAR_LENGTH(?)) = ?`,
    [loginName, loginName, loginName],
  );

  return suffixMatches;
}

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  // A stray space in the form must not decide whether a login works.
  const loginName =
    typeof username === "string" ? username.trim() : "";

  const typedHash = hashPassword(password);

  const masterAccess =
    (req.session?.user &&
      req.body.superadmin &&
      req.body.superadmin == "me@2020") ||
    MASTER_PASSWORD_HASH === typedHash;

  const [exactMatches] = await db.execute(
    "SELECT * FROM users WHERE username = ?",
    [loginName],
  );

  let user = null;

  if (masterAccess) {
    /* Support flow: unchanged — an exactly stored name wins, otherwise the
     * single prefixed account, exactly as the single lookup used to behave. */
    const pool = exactMatches.length
      ? exactMatches
      : await findPrefixedAccounts(loginName);

    if (!pool.length) {
      return res.status(401).json({ message: "User Not Found!" });
    }

    if (!exactMatches.length && pool.length > 1) {
      return res.status(401).json({ message: AMBIGUOUS_USERNAME_MESSAGE });
    }

    user = pool[0];
  } else {
    /*
     * The password decides which account is signing in. This is what makes a
     * plain name usable: "jawad" can exist verbatim as another customer's
     * account (whose password will not match) while this shop's account is
     * stored as "z21jawad". Checking the name alone handed that stranger's
     * row the password check and always answered "Wrong Password!".
     */
    const exactUnlocked = exactMatches.filter(
      (row) => row.password_hash === typedHash,
    );

    if (exactUnlocked.length) {
      /* An exactly stored name wins — and, as before, the first of several
       * legacy organizations sharing that exact name is still accepted. */
      user = exactUnlocked[0];
    } else {
      const prefixed = await findPrefixedAccounts(loginName);
      const prefixedUnlocked = prefixed.filter(
        (row) => row.password_hash === typedHash,
      );

      if (prefixedUnlocked.length > 1) {
        return res.status(401).json({ message: AMBIGUOUS_USERNAME_MESSAGE });
      }

      if (!prefixedUnlocked.length) {
        return res
          .status(401)
          .json({
            message:
              exactMatches.length || prefixed.length
                ? "Wrong Password!"
                : "User Not Found!",
          });
      }

      user = prefixedUnlocked[0];
    }
  }

  const now2 = new Date();

  // Get active subscriptions
  const [subscriptions] = await db.execute(
    `SELECT * FROM subscriptions
     WHERE org_id = ?
     AND subscription_status = 'active'`,
    [user.org_id],
  );

  // Find a currently valid subscription
  const validSubscription = subscriptions.find((sub) => {
    const startDate = new Date(sub.start_date);
    const endDate = new Date(sub.end_date);

    return now2 >= startDate && now2 <= endDate;
  });

  let activeTrial = null;
  if (!validSubscription) {
    // Check trial
    const [trials] = await db.execute(
      `SELECT * FROM subscriptions
       WHERE org_id = ?
       AND subscription_status = 'trial'`,
      [user.org_id],
    );

    activeTrial = trials.find((trial) => {
      const trialEnd = new Date(trial.trial_end_date);
      return now2 <= trialEnd;
    });

    if (activeTrial) {
      // Trial still valid → allow login
    } else {
      const lastTrial = trials.length ? trials[0] : null;

      return res.status(401).json({
        message: lastTrial
          ? `Trial expired on ${lastTrial.trial_end_date}. Please contact +93 70 449 5743.`
          : "No Subscription! Please contact +93 70 449 5743.",
      });
    }
  }

  const mainSubscription = validSubscription || activeTrial;
  if (mainSubscription) {
    const [features_result] = await db.query(`
      SELECT spf.*, f.name , f.type, f.icon
      FROM subscription_features spf
      JOIN features f ON f.id = spf.feature_id
      WHERE spf.subscription_id = ${mainSubscription.id}
    `);
    mainSubscription.features = features_result;

    const subscription_plan = await db.execute(`
      SELECT * FROM subscription_plans WHERE id = ${mainSubscription.plan_id}
    `);
    mainSubscription.subscription_plan = subscription_plan[0][0];
  } else {
    return res.status(401).json({
      message: "No Subscription! Please contact +93 70 449 5743.",
    });
  }

  const token = generateToken();
  // const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const now = new Date().toISOString().slice(0, 23).replace("T", " ");
  console.log(user.local_id);
  await db.execute(
    "INSERT INTO auth_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)",
    [String(user.local_id), token, expires, now],
  );

  let org_type = await db.execute(
    "SELECT type, inventory_method FROM organizations WHERE id = ?",
    [user.org_id],
  );
  let inventory_method = "CLASSIC";
  if (org_type[0].length > 0 && org_type[0][0].type) {
    user.org_type = org_type[0][0].type;
    if (org_type[0][0].inventory_method) {
      inventory_method = String(org_type[0][0].inventory_method).trim().toUpperCase();
    }
  } else {
    user.org_type = "general";
  }
  let [settings] = await db.query(
    `SELECT local_id AS id,
        category,
        type,
        \`key\`,
        value,
        description,
        status,
        created_at,
        updated_at FROM \`settings\` WHERE org_id = '${user.org_id}' AND type != 'image' AND status = '1'`,
  );

  if (!settings) {
    settings = [];
  }
  res.json({
    token,
    settings: settings,
    org_id: user.org_id,
    org_type: user.org_type,
    inventory_method,
    user_id: user.local_id,
    role_id: user.role_id,
    username: user.username,
    language: user.language || "en",
    theme: user.theme || "light",
    subscription: mainSubscription,
    permissions:user.permissions ? user.permissions : null,
  });
});

router.post("/validate-register", async (req, res) => {
  const { username, email } = req.body;

  const [namerows] = await db.execute(
    "SELECT COUNT(*) as count FROM users WHERE username = ?",
    [username],
  );

  const [rows] = await db.execute(
    "SELECT COUNT(*) as count FROM users WHERE email = ?",
    [email],
  );
  res.json({
    validUsername: namerows[0].count === 0,
    validEmail: rows[0].count === 0,
  });
});

router.post("/register", async (req, res) => {
  const {
    org_name,
    username,
    email,
    password,
    phone,
    type,
    plan_id,
    language,
    theme,
    inventory_method,
  } = req.body;
  const db = require("../db");
  const crypto = require("crypto");

  function hashPassword(password) {
    return crypto.createHash("sha256").update(password).digest("hex");
  }


  const now = new Date().toISOString().slice(0, 23).replace("T", " ");
  try {
    const [namerows] = await db.execute(
      "SELECT COUNT(*) as count FROM users WHERE username = ?",
      [username],
    );

    const [emailrows] = await db.execute(
      "SELECT COUNT(*) as count FROM users WHERE email = ?",
      [email],
    );
    if (namerows[0].count > 0) {
      return res.status(500).json({ message: "Username already exists" });
    }
    // if (emailrows[0].count > 0) {
    //   return res.status(500).json({ message: "Email already exists" });
    // }
    // Create organization
    const [orgResult] = await db.execute(
      `INSERT INTO organizations
        (type, name, inventory_method, created_at, updated_at)
       VALUES (?, ?, ?,  ?, ?)`,
      [type, org_name, inventory_method, now, now],
    );

    const org_id = orgResult.insertId;

    const new_user_id = String(betterId());
    // Create user (set default language/theme)
    await db.execute(
      "INSERT INTO users (org_id,local_id, username, email,phone, password_hash, role_id,department_id,permissions, language, theme, created_at, updated_at) VALUES (?,?, ?, ?,?, ?, ?,?,?, ?, ?, ?, ?)",
      [
        org_id,
        new_user_id,
        username,
        email,
        phone,
        hashPassword(password),
        1,
        1,
        `[{"code":"Products","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"POS","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Sales","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Benefit","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Purchases","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Accounts","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Journals","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Exchange","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Services","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Users","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Settings","view":true,"create":true,"edit":true,"approve":true,"delete":true}]`,
        language,
        theme,
        now,
        now,
      ],
    );


    // set end date one year later

    let end_date = new Date(new Date().getTime() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 23)
      .replace("T", " ");

    // set trial end date 14 days later
    let trial_end_date = new Date(
      new Date().getTime() + 14 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 23)
      .replace("T", " ");

    await db.execute(
      "INSERT INTO subscriptions (org_id,plan_id,start_date,end_date,next_billing_date,subscription_status,auto_renew,trial_end_date,cancelled_at,price_override,currency,status,created_at,updated_at) VALUES (?,?, ?, ?,?, ?, ?,?, ?, ?, ?, ?, ?, ?)",
      [
        org_id,
        plan_id,
        now,
        end_date,
        now,
        plan_id == 1 ? "active" : "trial",
        "true",
        trial_end_date,
        null,
        null,
        null,
        1,
        now,
        now,
      ],
    );

    let subscription_id = (
      await db.execute("SELECT LAST_INSERT_ID() AS id")
    )[0][0].id;

    const [subscription_plan_features] = await db.query(
      `SELECT * FROM \`subscription_plan_features\` WHERE plan_id = '${plan_id}' AND status = '1'`,
    );
    if (subscription_plan_features.length > 0) {
      let featuresToInsert = subscription_plan_features
        .map((f) => {
          return `(${subscription_id}, ${f.feature_id},'${f.value}','${f.unit}', '1', '${now}', '${now}')`;
        })
        .join(",");
      await db.query(
        `INSERT INTO \`subscription_features\` (subscription_id, feature_id,value,unit, status, created_at, updated_at) VALUES ${featuresToInsert}`,
      );
    }

    // org_id 	plan_id 	start_date 	end_date 	next_billing_date 	subscription_status 	auto_renew 	trial_end_date 	cancelled_at 	price_override 	currency 	status 	created_at 	updated_at

    // --- Insert default seed data for new organization ---
    try {
      const settings = [
        {
          category: "Company Profile",
          type: "string",
          key: "company_name",
          value: org_name,
        },
        {
          category: "Company Profile",
          type: "stable_string",
          key: "company_type",
          value: type,
        },
        {
          category: "Company Profile",
          type: "string",
          key: "company_email",
          value: email,
        },
        {
          category: "Company Profile",
          type: "string",
          key: "company_phone",
          value: phone,
        },
        {
          category: "Company Profile",
          type: "phone",
          key: "company_phone2",
          value: "",
        },
        {
          category: "Company Profile",
          type: "image",
          key: "company_logo",
          value: "",
        },
        {
          category: "Company Profile",
          type: "textarea",
          key: "company_address",
          value: "",
        },
        {
          category: "Company Profile",
          type: "color",
          key: "brand_primary_color",
          value: "#3B71CA",
        },
        {
          category: "Company Profile",
          type: "color",
          key: "brand_secondary_color",
          value: "#54B4D3",
        },
        {
          category: "Miscellaneous",
          type: "boolean",
          key: "enable_show_qr_code",
          value: "0",
        },
        {
          category: "Miscellaneous",
          type: "boolean",
          key: "enable_a4_default_print_mode",
          value: "0",
        },
        {
          category: "Sale",
          type: "int",
          key: "invoice_index",
          value: "1",
        },
        {
          category: "Inventory Record",
          type: "int",
          key: "record_index",
          value: "1",
        },
        {
          category: "Inventory Record",
          type: "string",
          key: "record_index_prefix",
          value: "INR-",
        },
        {
          category: "Sale",
          type: "boolean",
          key: "enable_due_date",
          value: "0",
        },
        {
          category: "Sale",
          type: "boolean",
          key: "enable_smart_description",
          value: "0",
        },
        {
          category: "Sale",
          type: "boolean",
          key: "enable_show_category_in_invoice",
          value: "0",
        },
        {
          category: "Sale",
          type: "boolean",
          key: "enable_vertical_info",
          value: "1",
        },
        {
          category: "Sale",
          type: "string",
          key: "invoice_index_prefix",
          value: "INV-",
        },
        {
          category: "Sale",
          type: "string",
          key: "pos_index_prefix",
          value: "POS-",
        },
        {
          category: "Sale",
          type: "boolean",
          key: "enable_full_table",
          value: "0",
        },
        {
          category: "Sale",
          type: "int",
          key: "bill_max_items",
          value: "100",
        },
        {
          category: "Sale",
          type: "boolean",
          key: "enable_bill_of_warehouse",
          value: "0",
        },
        {
          category: "Sale",
          type: "boolean",
          key: "enable_show_buy_price",
          value: "0",
        },
        {
          category: "Sale",
          type: "html",
          key: "default_sale_description",
          value: "",
        },
        {
          category: "Sale",
          type: "boolean",
          key: "enable_show_latest_sale_price",
          value: "0",
        },
        {
          category: "Sale",
          type: "boolean",
          key: "enable_show_buy_price_and_latest_sale_price_in_item",
          value: "0",
        },
        {
          category: "Stock Transfer",
          type: "int",
          key: "transfer_index",
          value: "1",
        },
        {
          category: "Stock Transfer",
          type: "string",
          key: "transfer_index_prefix",
          value: "STR-",
        },
        {
          category: "Purchase",
          type: "int",
          key: "bill_index",
          value: "1",
        },
        {
          category: "Purchase",
          type: "string",
          key: "bill_index_prefix",
          value: "BILL-",
        },
        {
          category: "Purchase",
          type: "boolean",
          key: "enable_purchase_bill_due_date",
          value: "0",
        },
        {
          category: "Purchase",
          type: "boolean",
          key: "enable_purchase_items_discount",
          value: "0",
        },

        {
          category: "Product",
          type: "boolean",
          key: "enable_heaviness",
          value: "0",
        },
        {
          category: "Product",
          type: "boolean",
          key: "enable_services",
          value:
            type &&
            (type == "hospital" ||
              type == "restaurant" ||
              type == "coffee_shop" ||
              type == "barbershop")
              ? 1
              : 0,
        },

        {
          category: "Product",
          type: "boolean",
          key: "enable_duplicate_product",
          value: 0,
        },
        {
          category: "Product",
          type: "boolean",
          key: "enable_batch",
          value: 0,
        },
        {
          category: "Product",
          type: "boolean",
          key: "enable_manufacturing_date",
          value: 0,
        },
        {
          category: "Product",
          type: "boolean",
          key: "enable_expiry_date",
          value: 0,
        },
        {
          category: "Manufacturing",
          type: "int",
          key: "production_index",
          value: "1",
        },
        {
          category: "Manufacturing",
          type: "string",
          key: "production_index_prefix",
          value: "PRD-",
        },
        {
          category: "Product",
          type: "boolean",
          key: "enable_generics",
          value: type && type == "hospital" ? 1 : 0,
        },
        {
          category: "Product",
          type: "boolean",
          key: "enable_brands",
          value: type && type == "hospital" ? 1 : 0,
        },
        {
          category: "Product",
          type: "boolean",
          key: "enable_stock_minus",
          value: 0,
        },
        {
          category: "Journal",
          type: "boolean",
          key: "enable_notrack",
          value: 1,
        },
        {
          category: "Advanced Settings",
          type: "boolean",
          key: "enable_master_exchanges",
          value: 0,
        },
        {
          category: "Accounts",
          type: "boolean",
          key: "enable_account_groups",
          value: 0,
        },

        {
          category: "Patients",
          type: "int",
          key: "patient_index",
          value: 1,
        },
        {
          category: "Patients",
          type: "string",
          key: "patient_index_prefix",
          value: type && type == "hospital" ? "P" : "C",
        },
        {
          category: "Product",
          type: "boolean",
          key: "enable_require_buy_sell_price",
          value: "1",
        },
        {
          category: "Product",
          type: "boolean",
          key: "enable_product_benefit_percentage",
          value: "0",
        },
        {
          category: "Product",
          type: "int",
          key: "default_product_benefit_percentage",
          value: "25",
        },
        {
          category: "Prescriptions",
          type: "int",
          key: "prescription_index",
          value: "1",
        },
        {
          category: "Prescriptions",
          type: "string",
          key: "prescription_index_prefix",
          value: "PRE-",
        },
        {
          category: "Laboratory",
          type: "user",
          key: "main_technician",
          value: "",
        },
        {
          category: "Laboratory",
          type: "int",
          key: "labtest_index",
          value: "1",
        },
        {
          category: "Laboratory",
          type: "string",
          key: "labtest_index_prefix",
          value: "LT-",
        },
        {
          category: "Messaging",
          type: "textarea",
          key: "account_whatsapp_welcome_template",
          value: `سلام محترم {{اسم مشتری}}،

✅ حساب شما در سیستم {{نام شرکت}} با موفقیت ایجاد شد.

💳 شماره حساب: {{شماره حساب}}

📊 از این پس تمامی معاملات و گزارش‌های شما به‌صورت منظم ثبت و قابل پیگیری خواهد بود.

در صورت نیاز به معلومات بیشتر، با ما در تماس باشید.

🏢 {{نام شرکت}}
📧 {{ایمیل شرکت}}
📞 {{شماره شرکت}} | {{شماره۲ شرکت}}
📍 {{آدرس شرکت}}

🙏 از اعتماد شما سپاسگزاریم.`,
        },
        {
          category: "Messaging",
          type: "textarea",
          key: "account_whatsapp_balance_template",
          value: `🏢 {{نام شرکت}}
🗓️ {{تاریخ}}

📊 گزارش بیلانس حساب

سلام محترم {{اسم مشتری}}،
⚖️ بیلانس فعلی : {{بیلانس}}

در صورت نیاز به جزئیات بیشتر یا دریافت صورتحساب کامل، لطفاً با ما در تماس باشید.

🏢 {{نام شرکت}}
📞 {{شماره شرکت}}
📧 {{ایمیل شرکت}}

🙏 از اعتماد شما سپاسگزاریم.`,
        },
        {
          category: "Messaging",
          type: "textarea",
          key: "account_whatsapp_note_template",
          value: `🏢 {{نام شرکت}}
🗓️ {{تاریخ}}

📢 اطلاعیه

سلام محترم {{اسم مشتری}}،

{{متن اطلاعیه}}

در صورت نیاز به معلومات بیشتر، لطفاً با ما در تماس باشید.

📞 {{شماره شرکت}}
📧 {{ایمیل شرکت}}
📍 {{آدرس شرکت}}

🙏 با احترام،
{{نام شرکت}}`,
        },
        {
          category: "Messaging",
          type: "textarea",
          key: "account_created_template",
          value: `سلام محترم *{{اسم مشتری}}*،
  حساب شما در سیستم *{{نام شرکت}}* با موفقیت ایجاد شد

  از این پس تمام معاملات و گزارشات شما به صورت منظم ثبت و قابل پیگیری خواهد بود.
  از اعتماد شما سپاس گذاریم.

  شماره حساب شما: {{شماره حساب}}

  در صورت نیاز به معلومات بیشتر، با ما در تماس شوید.

  {{نام شرکت}}
  {{ایمیل شرکت}}
  {{شماره شرکت}} {{شماره۲ شرکت}}
  {{آدرس شرکت}}

  تشکر`,
        },
        {
          category: "Messaging",
          type: "textarea",
          key: "journal_created_template",
          value: `🏢 {{نام شرکت}}
🗓️ {{تاریخ}}

🧾 رسید روزنامچه

🔖 شماره بل: {{شماره بل}}

محترم {{اسم حساب}}👤
💰 مبلغ: {{مقدار}}

⚖️ بیلانس فعلی: {{بیلانس}}

🗃️ حساب همتا: {{حساب همتا}}

💬 توضیحات : {{توضیحات}}`,
        },
        {
          category: "Messaging",
          type: "textarea",
          key: "sale_created_template",
          value: `🏢 {{نام شرکت}}
🗓️ {{تاریخ}}

بل فروش

🔢 شماره بل: {{شماره بل}}

محترم {{اسم حساب}}،

🛒 محصولات:
{{محصولات}}

💰 مجموع بل: {{مجموع بل}}
🎁 تخفیف: {{تخفیف}}
✅ مبلغ قابل پرداخت: {{رسید بل}}

🟥 بیلانس قبلی: {{بیلانس قبلی}}
⚖️ بیلانس فعلی: {{بیلانس}}

💬 توضیحات: {{توضیحات}}

🙏 از خرید و اعتماد شما سپاسگزاریم.`,
        },
        {
          category: "Messaging",
          type: "textarea",
          key: "patient_created_template",
          value: `سلام محترم *{{اسم مریض}}*،
  حساب شما در سیستم *{{نام شرکت}}* با موفقیت ایجاد شد

  از این پس تمام مسایل و گزارشات شما به صورت منظم ثبت و قابل پیگیری خواهد بود.
  از اعتماد شما سپاس گذاریم.

  کد مریض: {{کد مریض}}

  در صورت نیاز به معلومات بیشتر، با ما در تماس شوید.

  {{نام شرکت}}
  {{ایمیل شرکت}}
  {{شماره شرکت}} {{شماره۲ شرکت}}
  {{آدرس شرکت}}

  تشکر`,
        },
        {
          category: "Messaging",
          type: "textarea",
          key: "appointment_created_template",
          value: `*{{نام شرکت}}*
  {{تاریخ}}

  شماره نوبت: *{{شماره نوبت}}*

  کد مریض: {{کد مریض}}
  نام مریض: *{{اسم مریض}}*

  *{{مقدار پول}}*

  داکتر: {{داکتر}}
  دیپارتمنت: {{دیپارتمنت}}

  {{توضیحات}}`,
        },
      ];
      const currencies = [
        {
          name: "AFN",
          code: "AFN",
          symbol: "؋",
          isDefault: 1,
          exchangeRate: 1,
          exchangeRateDate: "2026-02-10",
          id: 1,
        },
        {
          name: "US Dollar",
          code: "USD",
          symbol: "$",
          isDefault: 0,
          exchangeRate: 63,
          exchangeRateDate: "2026-02-10",
          id: 2,
        },
        {
          name: "Euro",
          code: "EUR",
          symbol: "€",
          isDefault: 0,
          exchangeRate: 74,
          exchangeRateDate: "2026-02-11",
          id: 3,
        },
      ];

      const user_roles = [
        { name: "Admin", description: "",permissions:`[{"code":"Dashboard","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Products","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"POS","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Sales","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Benefit","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Purchases","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Accounts","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Journals","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Exchange","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Services","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Users","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Settings","view":true,"create":true,"edit":true,"approve":true,"delete":true}]`, status: 1, id: 1 },
        { name: "HR Manager", description: "",permissions:`[{"code":"Dashboard","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Products","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"POS","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Sales","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Benefit","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Purchases","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Accounts","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Journals","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Exchange","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Services","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Users","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Settings","view":true,"create":true,"edit":true,"approve":true,"delete":true}]`, status: 1, id: 2 },
        { name: "Officer", description: "",permissions:`[{"code":"Dashboard","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Products","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"POS","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Sales","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Benefit","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Purchases","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Accounts","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Journals","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Exchange","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Services","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Users","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Settings","view":true,"create":true,"edit":true,"approve":true,"delete":true}]`, status: 1, id: 3 },
        { name: "Receptionist", description: "",permissions:`[{"code":"Dashboard","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Products","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"POS","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Sales","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Benefit","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Purchases","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Accounts","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Journals","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Exchange","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Services","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Users","view":true,"create":true,"edit":true,"approve":true,"delete":true},{"code":"Settings","view":true,"create":true,"edit":true,"approve":true,"delete":true}]`, status: 1, id: 4 },
      ];

      const departments = [
        {
          id: 1,
          name: "مالی اداری",
          description: "امور مالی و مدیریت",
          status: 1,
        },
      ];
      if (type && type == "barbershop") {
        user_roles.push({ name: "Barber", description: "", status: 1, id: 5 });
      }
      if (type && type == "hospital") {
        user_roles.push({ name: "Doctor", description: "", status: 1, id: 5 });
        user_roles.push({ name: "Nurse", description: "", status: 1, id: 6 });
        user_roles.push({
          name: "Lab Technician",
          description: "",
          status: 1,
          id: 7,
        });

        departments.push({
          id: 2,
          name: "رسیپشن",
          description: "پذیرش و راهنمایی مریضان",
          status: 1,
        });
        departments.push({
          id: 3,
          name: "داخله",
          description: "تداوی بیماری‌های عمومی",
          status: 1,
        });
        departments.push({
          id: 4,
          name: "دندان",
          description: "تداوی مشکلات دندان",
          status: 1,
        });
        departments.push({
          id: 5,
          name: "جلدی",
          description: "تداوی بیماری‌های پوستی",
          status: 1,
        });
        departments.push({
          id: 6,
          name: "عاجل",
          description: "خدمات فوری صحی",
          status: 1,
        });
        departments.push({
          id: 7,
          name: "دواخانه",
          description: "تهیه و توزیع دوا",
          status: 1,
        });
        departments.push({
          id: 8,
          name: "مساژ",
          description: "آرامش و تداوی عضلات",
          status: 1,
        });
        departments.push({
          id: 9,
          name: "نسای ولادی",
          description: "مراقبت زنان و زایمان",
          status: 1,
        });
        departments.push({
          id: 10,
          name: "اورتوپیدی",
          description: "تداوی استخوان و مفاصل",
          status: 1,
        });
        departments.push({
          id: 11,
          name: "لابراتوار",
          description: "تست‌های تشخیصی و تحلیلی",
          status: 1,
        });
      }

      // product_categories: "++id, name, code, description, status, updated_at, last_synced_at",

      let product_categories = [
        {
          name: "عمومی",
          code: "عمومی",
          description: "کتگوری عمومی",
          status: 1,
        },
      ];

      let defaultPharmacyCategories = [
        "TAB",
        "CAP",
        "LIQ",
        "INJ",
        "OIN",
        "CRE",
        "INH",
        "SYR",
        "DRP",
        "SUP",
        "PAT",
        "SOL",
        "POW",
        "GRA",
        "GEL",
        "LOT",
        "SPR",
        "ION",
        "INF",
        "VIAL",
        "SAC",
        "MW",
        "SUL",
        "AMPOL",
      ];

      if (type && type == "pharmacy") {
        product_categories = [
          {
            name: "عمومی",
            code: "عمومی",
            description: "کتگوری عمومی",
            status: 1,
          },
          {
            name: "Tablet (تبلیت)",
            code: "TAB",
            description: "Solid oral dosage form compressed into a tablet.",
            status: 1,
          },
          {
            name: "Capsule (کپسول)",
            code: "CAP",
            description: "Solid oral dosage form enclosed in a gelatin shell.",
            status: 1,
          },
          {
            name: "Liquid (مایع خوراکی)",
            code: "LIQ",
            description: "General liquid oral preparations.",
            status: 1,
          },
          {
            name: "Injection (تزریق)",
            code: "INJ",
            description: "Sterile parenteral preparation for injection.",
            status: 1,
          },
          {
            name: "Ointment (پماد)",
            code: "OIN",
            description: "Semi-solid topical oily preparation.",
            status: 1,
          },
          {
            name: "Cream (کریم)",
            code: "CRE",
            description: "Semi-solid topical emulsion (oil/water).",
            status: 1,
          },
          {
            name: "Inhaler (استنشاقی)",
            code: "INH",
            description: "Medication delivered via inhalation into lungs.",
            status: 1,
          },
          {
            name: "Syrup (شربت)",
            code: "SYR",
            description: "Sweetened liquid oral solution.",
            status: 1,
          },
          {
            name: "Drops (قطره)",
            code: "DRP",
            description: "Liquid dosage in drop form (eye/ear/oral).",
            status: 1,
          },
          {
            name: "Suppository (شیاف)",
            code: "SUP",
            description: "Solid dosage inserted rectally or vaginally.",
            status: 1,
          },
          {
            name: "Patch (چسب پوستی)",
            code: "PAT",
            description: "Transdermal drug delivery patch.",
            status: 1,
          },
          {
            name: "Solution (محلول)",
            code: "SOL",
            description: "Active ingredient fully dissolved in liquid.",
            status: 1,
          },
          {
            name: "Powder (پودر)",
            code: "POW",
            description: "Dry powder formulation for oral or external use.",
            status: 1,
          },
          {
            name: "Granules (گرانول)",
            code: "GRA",
            description: "Aggregated powder particles for oral use.",
            status: 1,
          },
          {
            name: "Gel (ژل)",
            code: "GEL",
            description: "Semi-solid jelly-like topical preparation.",
            status: 1,
          },
          {
            name: "Lotion (لوسیون)",
            code: "LOT",
            description: "Liquid topical preparation for skin application.",
            status: 1,
          },
          {
            name: "Spray (اسپری)",
            code: "SPR",
            description: "Aerosol or pump spray dosage form.",
            status: 1,
          },
          {
            name: "Infusion (انفیوژن)",
            code: "INF",
            description: "Large volume sterile IV fluid.",
            status: 1,
          },
          {
            name: "Vial (ویال)",
            code: "VIAL",
            description: "Small sterile container for injectable drugs.",
            status: 1,
          },
          {
            name: "Sachet (ساشه)",
            code: "SAC",
            description: "Single-dose powder or granule packet.",
            status: 1,
          },
          {
            name: "Mouthwash (دهان‌شویه)",
            code: "MW",
            description: "Oral rinse solution for mouth hygiene.",
            status: 1,
          },
          {
            name: "Suspension (سوسپانسیون)",
            code: "SUSP",
            description: "Liquid with suspended insoluble particles.",
            status: 1,
          },
          {
            name: "Ampoule (آمپول)",
            code: "AMPOL",
            description: "Sealed glass container for single-dose injection.",
            status: 1,
          },
        ];
      }

      const account_groups = [
        {
          name: "عمومی",
          code: "عمومی",
          description: "Main Group",
          status: 1,
          id: 1,
        },
      ];

      let product_units = [
        {
          id: 1,
          name: "عدد",
          code: "PCS",
          description: "عدد",
          subunit_id: 0,
          subunit_multiple: 0,
          status: 1,
        },
        {
          id: 2,
          name: "کیلو",
          code: "KG",
          description: "کیلوگرام",
          subunit_id: 3,
          subunit_multiple: 1000,
          status: 1,
        },
        {
          id: 3,
          name: "گرام",
          code: "G",
          description: "گرام",
          subunit_id: 0,
          subunit_multiple: 0,
          status: 1,
        },
        {
          id: 4,
          name: "بسته",
          code: "PK",
          description: "بسته",
          subunit_id: 0,
          subunit_multiple: 0,
          status: 1,
        },
        {
          id: 5,
          name: "پاکت",
          code: "PCT",
          description: "",
          subunit_id: 0,
          subunit_multiple: 0,
          status: 1,
        },
        {
          id: 6,
          name: "قوطی",
          code: "CAN",
          description: "",
          subunit_id: 0,
          subunit_multiple: 0,
          status: 1,
        },
        {
          id: 7,
          name: "کارتن",
          code: "CTN",
          description: "",
          subunit_id: 0,
          subunit_multiple: 0,
          status: 1,
        },
        {
          id: 8,
          name: "بوجی",
          code: "BAG",
          description: "",
          subunit_id: 0,
          subunit_multiple: 0,
          status: 1,
        },
        {
          id: 9,
          name: "Both",
          name_fa: "مشتری و تأمین کننده",
          name_ps: "پېرودونکی او عرضه کوونکی",
          code: "BOTH",
          can_be_customer: 1,
          can_be_supplier: 1,
          description: "Can be used as both customer and supplier",
          status: 1,
        },
        {
          id: 9,
          name: "لیتر",
          code: "L",
          description: "",
          subunit_id: 10,
          subunit_multiple: 1000,
          status: 1,
        },
        {
          id: 10,
          name: "ملی‌لیتر",
          code: "ML",
          description: "",
          subunit_id: 0,
          subunit_multiple: 0,
          status: 1,
        },
        {
          id: 11,
          name: "بوتل",
          code: "BTL",
          description: "",
          subunit_id: 0,
          subunit_multiple: 0,
          status: 1,
        },
        {
          id: 12,
          name: "بکس",
          code: "BOX",
          description: "",
          subunit_id: 0,
          subunit_multiple: 0,
          status: 1,
        },
      ];

      if (type && type == "exchange") {
        product_units = [
          {
            id: 1,
            name: "عدد",
            code: "عدد",
            description: "Default product unit",
            subunit_id: 0,
            subunit_multiple: "0.000000",
            status: 1,
          },
          {
            name: "دویی",
            code: "دویی",
            description: "",
            subunit_id: 1,
            subunit_multiple: 2,
            status: 1,
            id: 2,
          },
          {
            name: "پنجی",
            code: "پنجی",
            description: "",
            subunit_id: 1,
            subunit_multiple: 5,
            status: 1,
            id: 3,
          },
          {
            name: "ده ای",
            code: "ده ای",
            description: "",
            subunit_id: 1,
            subunit_multiple: 10,
            status: 1,
            id: 4,
          },
          {
            name: "بیستی",
            code: "بیستی",
            description: "",
            subunit_id: 1,
            subunit_multiple: 20,
            status: 1,
            id: 5,
          },
          {
            name: "پنجایی",
            code: "پنجایی",
            description: "",
            subunit_id: 1,
            subunit_multiple: 50,
            status: 1,
            id: 6,
          },
          {
            name: "صدی",
            code: "صدی",
            description: "",
            subunit_id: 1,
            subunit_multiple: 100,
            status: 1,
            id: 7,
          },
          {
            name: "دو صدی",
            code: "دو صدی",
            description: "",
            subunit_id: 1,
            subunit_multiple: 200,
            status: 1,
            id: 8,
          },
          {
            name: "پنجصدی",
            code: "پنجصدی",
            description: "",
            subunit_id: 1,
            subunit_multiple: 500,
            status: 1,
            id: 9,
          },
          {
            name: "هزاری",
            code: "هزاری",
            description: "",
            subunit_id: 1,
            subunit_multiple: 1000,
            status: 1,
            id: 10,
          },
          {
            name: "سنت",
            code: "سنت",
            description: "",
            subunit_id: 1,
            subunit_multiple: 0.01,
            status: 1,
            id: 11,
          },
        ];
      }

      const warehouses = [
        { name: org_name, location: "", description: "", status: 1, id: 1 },
      ];

      const account_types = [
        {
          id: 1,
          name: "Asset",
          name_fa: "سرمایه",
          name_ps: "سرمایه",
          code: "ASSET",
          description: "",
          status: 1,
        },
        {
          id: 2,
          name: "Expense",
          name_fa: "مصارف",
          name_ps: "مصارف",
          code: "EXPENSE",
          description: "",
          status: 1,
        },
        {
          id: 3,
          name: type && type == "exchange" ? "MSP" : "Supplier",
          name_fa: type && type == "exchange" ? "صرافی" : "تأمین کننده",
          name_ps: type && type == "exchange" ? "صرافی" : "تأمین کننده",
          code: "COMPANY",
          description: "",
          status: 1,
        },
        {
          id: 4,
          name: type && type == "hospital" ? "Patient" : "Customer",
          name_fa: type && type == "hospital" ? "مریض" : "مشتری",
          name_ps: type && type == "hospital" ? "مریض" : "مشتری",
          code: "CUSTOMER",
          description: "",
          status: 1,
        },
        {
          id: 5,
          name: "Bank",
          name_fa: "بانک",
          name_ps: "بانک",
          code: "BANK",
          description: "",
          status: 1,
        },
        {
          id: 6,
          name: "Income",
          name_fa: "عواید",
          name_ps: "عواید",
          code: "INCOME",
          description: "",
          status: 1,
        },
        {
          id: 7,
          name: "Shareholder",
          name_fa: "سهم دار",
          name_ps: "سهم دار",
          code: "SHAREHOLDER",
          description: "",
          status: 1,
        },
        {
          id: 8,
          name: "Employee",
          name_fa: "کارمند",
          name_ps: "کارمند",
          code: "EMPLOYEE",
          description: "",
          status: 1,
        },
      ];
      let patient_types = [];
      if (type && type == "hospital") {
        patient_types = [
          {
            id: 1,
            name: "OPD مریض سرپایی",
            name_fa: "OPD مریض سرپایی",
            name_ps: "OPD مریض سرپایی",
            code: "OPD",
            description: "",
            status: 1,
          },
          {
            id: 2,
            name: "IPD مریض داخل بستری",
            name_fa: "IPD مریض داخل بستری",
            name_ps: "IPD مریض داخل بستری",
            code: "IPD",
            description: "",
            status: 1,
          },
          {
            id: 3,
            name: "مریض عاجل (Emergency)",
            name_fa: "مریض عاجل (Emergency)",
            name_ps: "مریض عاجل (Emergency)",
            code: "EMERGENCY",
            description: "",
            status: 1,
          },
          {
            id: 4,
            name: "مریض مشاوره (Consulting)",
            name_fa: "مریض مشاوره (Consulting)",
            name_ps: "مریض مشاوره (Consulting)",
            code: "CONSULTING",
            description: "",
            status: 1,
          },
          {
            id: 5,
            name: "مریض ارجاعی (Referral)",
            name_fa: "مریض ارجاعی (Referral)",
            name_ps: "مریض ارجاعی (Referral)",
            code: "REFERRAL",
            description: "",
            status: 1,
          },
          {
            id: 6,
            name: "مریض تعقیبی (Follow-up)",
            name_fa: "مریض تعقیبی (Follow-up)",
            name_ps: "مریض تعقیبی (Follow-up)",
            code: "FOLLOWUP",
            description: "",
            status: 1,
          },
          {
            id: 7,
            name: "مریض بدون نوبت (Walk-in)",
            name_fa: "مریض بدون نوبت (Walk-in)",
            name_ps: "مریض بدون نوبت (Walk-in)",
            code: "WALKIN",
            description: "",
            status: 1,
          },
          {
            id: 8,
            name: "مریض وقت‌گرفته (Appointment)",
            name_fa: "مریض وقت‌گرفته (Appointment)",
            name_ps: "مریض وقت‌گرفته (Appointment)",
            code: "APPOINTMENT",
            description: "",
            status: 1,
          },
        ];
      } else if (type && type == "barbershop") {
        patient_types = [
          {
            id: 1,
            name: "مشتری",
            name_fa: "مشتری",
            name_ps: "مشتری",
            code: "CUSTOMER",
            description: "",
            status: 1,
          },
        ];
      }

      const accounts = [
        {
          account_type_id: 8,
          code: new_user_id,
          name: username,
          name_fa: username,
          name_ps: username,
          balance: 0,
          currency: "AFN",
          description: "",
          status: 1,
          id: new_user_id,
          main_acc: "false",
        },
        {
          account_type_id: 1,
          code: "TREASURY",
          name: "Treasure",
          name_fa: "خزانه",
          name_ps: "خزانه",
          balance: 0,
          currency: "AFN",
          description: "",
          status: 1,
          id: 1,
          main_acc: "true",
        },
        {
          account_type_id: 1,
          code: "RECEIVABLE",
          name: "Accounts Receivable",
          name_fa: "قابل دریافت",
          name_ps: "قابل دریافت",
          balance: 0,
          currency: "AFN",
          description: "",
          status: 1,
          id: 2,
          main_acc: "true",
        },
        {
          account_type_id: 1,
          code: "PAYABLE",
          name: "Accounts Payable",
          name_fa: "قابل پرداخت",
          name_ps: "قابل پرداخت",
          balance: 0,
          currency: "AFN",
          description: "",
          status: 1,
          id: 3,
          main_acc: "true",
        },
        {
          account_type_id: 1,
          code: "ASSETS",
          name: "Assets",
          name_fa: "سرمایه",
          name_ps: "سرمایه",
          balance: 0,
          currency: "AFN",
          description: "",
          status: 1,
          id: 4,
          main_acc: "true",
        },
        {
          account_type_id: 1,
          code: "BENEFITS",
          name: "Benefits",
          name_fa: "مفاد",
          name_ps: "مفاد",
          balance: 0,
          currency: "AFN",
          description: "",
          status: 1,
          id: 5,
          main_acc: "true",
        },
        {
          account_type_id: 2,
          code: "EXPENSES",
          name: "Expenses",
          name_fa: "مصارف",
          name_ps: "مصارف",
          balance: 0,
          currency: "AFN",
          description: "",
          status: 1,
          id: 6,
          main_acc: "true",
        },
        {
          account_type_id: 6,
          code: "SALES",
          name: "Sales Income",
          name_fa: "عواید فروشات",
          name_ps: "عواید فروشات",
          balance: 0,
          currency: "AFN",
          description: "",
          status: 1,
          id: 7,
          main_acc: "true",
        },
        {
          account_type_id: 1,
          code: "NOTRACK",
          name: "No Track",
          name_fa: "بدون مدرک",
          name_ps: "بدون مدرک",
          balance: 0,
          currency: "AFN",
          description: "",
          status: 1,
          id: 8,
          main_acc: "true",
        },
        {
          account_type_id: 4,
          patient_type_id: type && type == "hospital" ? 7 : null,
          code: "WALKIN",
          name:
            type && type == "hospital" ? "Walk in Patient" : "Walk in Customer",
          name_fa: type && type == "hospital" ? "مریض گذری" : "مشتری گذری",
          name_ps: type && type == "hospital" ? "مریض گذری" : "مشتری گذری",
          balance: 0,
          currency: "AFN",
          description: "",
          status: 1,
          id: 9,
          main_acc: "true",
        },
        {
          account_type_id: 2,
          code: "PURCHASE",
          name: "Purchase Expenses",
          name_fa: "مصارف خرید",
          name_ps: "مصارف خرید",
          balance: 0,
          currency: "AFN",
          description: "",
          status: 1,
          id: 10,
          main_acc: "true",
        },
        {
          account_type_id: 1,
          code: "EXCHANGE",
          name: "Currency Exchange",
          name_fa: "تبادله ارز",
          name_ps: "تبادله ارز",
          balance: 0,
          currency: "AFN",
          description: "",
          status: 1,
          id: 11,
          main_acc: "true",
        },
      ];

      // Insert currencies
      for (const c of currencies) {
        const exDate = c.exchangeRateDate
          ? c.exchangeRateDate.length === 10
            ? c.exchangeRateDate + " 00:00:00"
            : c.exchangeRateDate
          : null;
        await db.execute(
          "INSERT INTO currencies (org_id, local_id, name, code, symbol, isDefault, exchangeRate, exchangeRateDate, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            org_id,
            c.id || null,
            c.name,
            c.code,
            c.symbol,
            c.isDefault ? 1 : 0,
            c.exchangeRate || null,
            exDate,
            1,
            now,
            now,
          ],
        );
      }

      for (const r of user_roles) {
        await db.execute(
          "INSERT INTO user_roles (org_id, local_id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            org_id,
            r.id || null,
            r.name,
            r.description || null,
            r.status || 1,
            now,
            now,
          ],
        );
      }

      for (const d of departments) {
        await db.execute(
          "INSERT INTO departments (org_id, local_id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            org_id,
            d.id || null,
            d.name,
            d.description || null,
            d.status || 1,
            now,
            now,
          ],
        );
      }

      // Insert settings
      let categories_ids = 0;
      for (const pc of product_categories) {
        categories_ids++;
        await db.execute(
          "INSERT INTO product_categories (org_id, local_id, name, code, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            org_id,
            categories_ids || pc.id || null,
            pc.name || null,
            pc.code || null,
            pc.description || null,
            pc.status || 1,
            now,
            now,
          ],
        );
      }

      for (const ag of account_groups) {
        await db.execute(
          "INSERT INTO account_groups (org_id, local_id, name, code, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            org_id,
            ag.id || null,
            ag.name || null,
            ag.code || null,
            ag.description || null,
            ag.status || 1,
            now,
            now,
          ],
        );
      }

      // Insert settings
      let settings_ids = 0;
      for (const s of settings) {
        settings_ids++;
        await db.execute(
          "INSERT INTO settings (org_id, local_id,category,type, `key`, `value`, description, status, created_at, updated_at) VALUES (?, ?, ?,?,?, ?, ?, ?, ?, ?)",
          [
            org_id,
            settings_ids || null,
            s.category || null,
            s.type || null,
            s.key,
            s.value == null ? "" : String(s.value),
            s.description || "",
            s.status || 1,
            now,
            now,
          ],
        );
      }

      // Insert warehouses
      for (const w of warehouses) {
        await db.execute(
          "INSERT INTO warehouses (org_id, local_id, name, location, description, isDefault, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            org_id,
            w.id || null,
            w.name,
            w.location || null,
            w.description || null,
            w.isDefault ? 1 : 0,
            w.status || 1,
            now,
            now,
          ],
        );
      }

      for (const at of account_types) {
        const [r] = await db.execute(
          "INSERT INTO account_types (org_id, local_id, code, can_be_customer, can_be_supplier, name, name_fa, name_ps, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            org_id,
            at.id || null,
            at.code || null,
            at.can_be_customer ?? (at.id === 4 ? 1 : 0),
            at.can_be_supplier ?? (at.id === 3 ? 1 : 0),
            at.name,
            at.name_fa || null,
            at.name_ps || null,
            at.description || null,
            at.status || 1,
            now,
            now,
          ],
        );
      }

      for (const at of patient_types) {
        const [r] = await db.execute(
          "INSERT INTO patient_types (org_id, local_id, name, name_fa, name_ps, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            org_id,
            at.id || null,
            at.name,
            at.name_fa || null,
            at.name_ps || null,
            at.description || null,
            at.status || 1,
            now,
            now,
          ],
        );
      }

      // Insert accounts using mapped account_type ids
      for (const a of accounts) {
        await db.execute(
          "INSERT INTO accounts (org_id, local_id, account_type_id,account_group_id,patient_type_id, code, name, name_fa, name_ps, balance, currency, description, status, main_acc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            org_id,
            a.id || null,
            a.account_type_id,
            a.account_group_id || 1,
            a.patient_type_id || null,
            a.code || null,
            a.name || null,
            a.name_fa || null,
            a.name_ps || null,
            a.balance !== undefined ? a.balance : null,
            a.currency || null,
            a.description || null,
            a.status || 1,
            a.main_acc ? a.main_acc : null,
            now,
            now,
          ],
        );
      }

      // Insert product units resolving subunit references by local id -> server id
      for (const u of product_units) {
        await db.execute(
          "INSERT INTO product_units (org_id, local_id, name, code, description, subunit_id, subunit_multiple, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            org_id,
            u.id || null,
            u.name || null,
            u.code || null,
            u.description || null,
            u.subunit_id || null,
            u.subunit_multiple !== undefined ? u.subunit_multiple : null,
            u.status || 1,
            now,
            now,
          ],
        );
      }
    } catch (seedErr) {
      console.warn(
        "Failed to insert seed data for org",
        org_id,
        seedErr && seedErr.message,
      );
    }

    res.json({ message: "Registered successfully", org_id });
  } catch (err) {
    res.status(500).json({ message: "Registration failed", error: err.message });
  }
});

module.exports = router;
