const STRINGS = {
  en: {},
  fa: {
    Dashboard: "داشبورد",
    Organizations: "سازمان‌ها",
    "Organization Types": "انواع سازمان",
    Features: "ویژگی‌ها",
    "Subscription Plans": "طرح‌های اشتراک",
    Subscriptions: "اشتراک‌ها",
    "Error Logs": "خطاها",
    Commands: "فرمان‌ها",
    "All organizations": "همهٔ سازمان‌ها",
    Language: "زبان",
    Apply: "اعمال",
    Save: "ذخیره",
    New: "جدید",
    Details: "جزئیات",
    Select: "انتخاب",
    Previous: "قبلی",
    Next: "بعدی",
    Page: "صفحه",
    Records: "سوابق",
    Search: "جستجو",
    Print: "چاپ",
    "Add feature": "افزودن ویژگی",
    Remove: "حذف",
    Payments: "پرداخت‌ها",
    "Record payment": "ثبت پرداخت",
    Back: "بازگشت",
    Users: "کاربران",
    Invoices: "صورتحساب‌ها",
  },
  ps: {
    Dashboard: "ډشبورډ",
    Organizations: "سازمانونه",
    "Organization Types": "د سازمان ډولونه",
    Features: "ځانګړنې",
    "Subscription Plans": "د ګډون پلانونه",
    Subscriptions: "ګډونونه",
    "Error Logs": "تېروتنې",
    Commands: "امرونه",
    "All organizations": "ټول سازمانونه",
    Language: "ژبه",
    Apply: "پلي کول",
    Save: "خوندي کول",
    New: "نوی",
    Details: "تفصیل",
    Select: "ټاکل",
    Previous: "مخکینی",
    Next: "راتلونکی",
    Page: "پاڼه",
    Records: "ریکارډونه",
    Search: "لټون",
    Print: "چاپ",
    "Add feature": "ځانګړنه زیاتول",
    Remove: "لرې کول",
    Payments: "تادیات",
    "Record payment": "تادیه ثبتول",
    Back: "بېرته",
    Users: "کارنان",
    Invoices: "بلونه",
  },
};
const NAV = [
  ["Dashboard", "/", "bi-speedometer2"],
  ["Organizations", "/organizations", "bi-building"],
  ["Organization Types", "/list-org-types/id/DESC/0/20/1", "bi-building-gear"],
  ["Features", "/list-features/id/DESC/0/20/1", "bi-grid"],
  [
    "Subscription Plans",
    "/list-subscription-plans/id/DESC/0/20/1",
    "bi-card-list",
  ],
  ["Subscriptions", "/list-subscriptions/id/DESC/0/20/1", "bi-calendar-check"],
  ["Error Logs", "/list-error-logs/id/DESC/0/20/1", "bi-bug"],
  ["Commands", "/list-commands/id/DESC/0/20/1", "bi-terminal"],
];
const RECORDS = [
  "users",
  "sync_logs",
  "warehouses",
  "products",
  "product_images",
  "product_categories",
  "product_units",
  "product_brands",
  "product_generics",
  "currencies",
  "sales",
  "purchases",
  "accounts",
  "account_groups",
  "journals",
  "activity_logs",
  "settings",
  "stock_transactions",
  "wastes",
  "stock_transfers",
];
module.exports = (db) => async (req, res, next) => {
  const language = ["en", "fa", "ps"].includes(req.query.lang)
    ? req.query.lang
    : ["en", "fa", "ps"].includes(req.session?.smartSuperAdminLanguage)
      ? req.session.smartSuperAdminLanguage
      : "en";
  let orgId = Number(req.session?.selectedOrganizationId) || 0,
    organization = null;
  if (orgId) {
    try {
      organization = await db.one("organizations", orgId);
    } catch (error) {
      if (error.status !== 404) throw error;
      orgId = 0;
      if (req.session) req.session.selectedOrganizationId = 0;
    }
  }
  res.locals.base = "/smart-super-admin";
  res.locals.language = language;
  res.locals.htmlLanguage = { en: "en", fa: "fa-AF", ps: "ps-AF" }[language];
  res.locals.rtl = language !== "en";
  res.locals.direction = language === "en" ? "ltr" : "rtl";
  res.locals.labels = STRINGS[language];
  res.locals.orgId = orgId;
  res.locals.orgName =
    organization?.name ||
    STRINGS[language]["All organizations"] ||
    "All organizations";
  res.locals.userName =
    typeof req.session?.user?.username === "string"
      ? req.session.user.username
      : "Operator";
  res.locals.languages = [
    { code: "en", label: "English" },
    { code: "fa", label: "دری" },
    { code: "ps", label: "پښتو" },
  ].map((item) => ({ ...item, selected: item.code === language }));
  res.locals.navigation = NAV.map(([label, url, icon]) => ({
    label,
    url:
      "/smart-super-admin" +
      (["Subscriptions", "Error Logs", "Commands"].includes(label)
        ? url.replace("/0/20/1", "/" + orgId + "/20/1")
        : url),
    icon,
    active:
      req.path === url ||
      (url !== "/" && req.path.startsWith(url.split("/id/")[0])),
  }));
  res.locals.recordNavigation = RECORDS.map((table) => ({
    label: table.replaceAll("_", " "),
    url: `/smart-super-admin/list/${table}/id/DESC/${orgId}/20/1`,
  }));
  next();
};
