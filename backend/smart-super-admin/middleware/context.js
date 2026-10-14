const STRINGS = {
  en: {},
  fa: {
    Navigation: "ناوبری",
    Preferences: "تنظیمات",
    Fullscreen: "تمام‌صفحه",
    "Page navigation": "ناوبری صفحه",
    "Open navigation": "باز کردن فهرست",
    "Close navigation": "بستن فهرست",
    "Collapse sidebar": "جمع کردن نوار کناری",
    "Expand sidebar": "باز کردن نوار کناری",
    Actions: "عملیات",
    "Row actions": "عملیات ردیف",
    Edit: "ویرایش",
    Rows: "ردیف‌ها",
    Pagination: "صفحه‌بندی",
    Status: "وضعیت",
    "Log type": "نوع گزارش",
    "Type / status": "نوع / وضعیت",
    "Current organization": "سازمان فعلی",
    "Organization List": "فهرست سازمان‌ها",
    "No matching records.": "هیچ سابقه‌ای یافت نشد.",
    "Try another search or filter.": "جستجو یا فیلتر دیگری را امتحان کنید.",
    "No organizations found.": "هیچ سازمانی یافت نشد.",
    Dashboard: "داشبورد",
    Organizations: "سازمان‌ها",
    "Organization Types": "انواع سازمان",
    Features: "ویژگی‌ها",
    "Subscription Plans": "طرح‌های اشتراک",
    Subscriptions: "اشتراک‌ها",
    "All organizations": "همهٔ سازمان‌ها",
    Language: "زبان",
    Apply: "اعمال",
    Save: "ذخیره",
    New: "جدید",
    Details: "جزئیات",
    Download: "دانلود",
    From: "از",
    To: "تا",
    Select: "انتخاب",
    Previous: "قبلی",
    Next: "بعدی",
    Page: "صفحه",
    Records: "سوابق",
    Search: "جستجو",
    Filter: "فلتر",
    Reset: "حذف فلترها",
    Close: "بستن",
    "Clear search": "پاک کردن جستجو",
    "Choose the options you need": "گزینه‌های مورد نظر را انتخاب کنید",
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
    Navigation: "لارښود",
    Preferences: "غوراوي",
    Fullscreen: "بشپړه پرده",
    "Page navigation": "د پاڼې لارښود",
    "Open navigation": "لارښود پرانیستل",
    "Close navigation": "لارښود تړل",
    "Collapse sidebar": "اړخ پټه راټولول",
    "Expand sidebar": "اړخ پټه پراخول",
    Actions: "کړنې",
    "Row actions": "د قطار کړنې",
    Edit: "سمول",
    Rows: "قطارونه",
    Pagination: "پاڼې",
    Status: "حالت",
    "Log type": "د راپور ډول",
    "Type / status": "ډول / حالت",
    "Current organization": "اوسنی سازمان",
    "Organization List": "د سازمانونو لړلیک",
    "No matching records.": "هیڅ ریکارډ ونه موندل شو.",
    "Try another search or filter.": "بله پلټنه یا فلټر وازمویئ.",
    "No organizations found.": "هیڅ سازمان ونه موندل شو.",
    Dashboard: "ډشبورډ",
    Organizations: "سازمانونه",
    "Organization Types": "د سازمان ډولونه",
    Features: "ځانګړنې",
    "Subscription Plans": "د ګډون پلانونه",
    Subscriptions: "ګډونونه",
    "All organizations": "ټول سازمانونه",
    Language: "ژبه",
    Apply: "پلي کول",
    Save: "خوندي کول",
    New: "نوی",
    Details: "تفصیل",
    Download: "ډاونلوډ",
    From: "له",
    To: "تر",
    Select: "ټاکل",
    Previous: "مخکینی",
    Next: "راتلونکی",
    Page: "پاڼه",
    Records: "ریکارډونه",
    Search: "لټون",
    Filter: "چاڼ",
    Reset: "چاڼونه لرې کول",
    Close: "بندول",
    "Clear search": "لټون پاک کړئ",
    "Choose the options you need": "خپلې غوښتل شوې ګڼې وټاکئ",
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
];
const RECORDS = [
  "users",
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
  res.locals.userInitial = [...res.locals.userName][0]?.toUpperCase() || "O";
  const section = [
    ["Organizations", /^\/(organizations|organization-list)(\/|$)/],
    ["Organization Types", /^\/(list-org-types|org-type)(\/|$)/],
    ["Features", /^\/(list-features|feature)(\/|$)/],
    [
      "Subscription Plans",
      /^\/(list-subscription-plans|subscription-plan|subscription-plan-features)(\/|$)/,
    ],
    [
      "Subscriptions",
      /^\/(list-subscriptions|subscription|invoices|invoice|payment)(\/|$)/,
    ],
  ].find(([, pattern]) => pattern.test(req.path))?.[0];
  res.locals.navigation = NAV.map(([label, url, icon]) => ({
    label,
    url:
      "/smart-super-admin" +
      (label === "Subscriptions"
        ? url.replace("/0/20/1", "/" + orgId + "/20/1")
        : url),
    icon,
    active:
      label === section ||
      req.path === url ||
      (url !== "/" && req.path.startsWith(url.split("/id/")[0])),
  }));
  res.locals.recordNavigation = RECORDS.map((table) => ({
    label: table.replaceAll("_", " "),
    url: `/smart-super-admin/list/${table}/id/DESC/${orgId}/20/1`,
    active:
      req.path.startsWith(`/list/${table}/`) ||
      req.path.startsWith(`/view/${table}/`) ||
      req.path.startsWith(`/edit/${table}/`),
  }));
  res.locals.recordsActive = res.locals.recordNavigation.some(
    (item) => item.active,
  );
  const active = res.locals.navigation.find((item) => item.active);
  if (active) {
    const secondary = {
      Organizations: ["Organization List", "/organization-list/id/DESC/0/20/1"],
      "Organization Types": ["New", "/org-type"],
      Features: ["New", "/feature"],
      "Subscription Plans": ["New", "/subscription-plan"],
      Subscriptions: ["New", `/subscription/0/${orgId}`],
    }[active.label];
    const secondaryUrl = secondary && "/smart-super-admin" + secondary[1];
    const secondaryActive =
      secondary &&
      (active.label === "Organizations"
        ? req.path.startsWith("/organization-list/")
        : req.path === secondary[1]);
    res.locals.pageNavigation = [{ ...active, active: !secondaryActive }];
    if (secondary)
      res.locals.pageNavigation.push({
        label: secondary[0],
        url: secondaryUrl,
        active: secondaryActive,
      });
  }
  next();
};
