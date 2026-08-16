const fs = require("fs");
const path = "C:/zeno-erp-online/backend/routes/v2/index.js";
let s = fs.readFileSync(path, "utf8");

const importAnchor = "const accountImageRoutes =\n  require('./account-image.routes');\n";
if (!s.includes(importAnchor)) {
  console.error("IMPORT ANCHOR NOT FOUND");
  process.exit(1);
}
s = s.split(importAnchor).join(
  importAnchor +
    "\nconst salePaymentRoutes =\n  require('./sale-payment.routes');\n\nconst purchasePaymentRoutes =\n  require('./purchase-payment.routes');\n"
);

const useAnchor = "router.use(\n  '/account-images',\n  accountImageRoutes,\n);\n";
if (!s.includes(useAnchor)) {
  console.error("USE ANCHOR NOT FOUND");
  process.exit(1);
}
s = s.split(useAnchor).join(
  useAnchor +
    "\nrouter.use(\n  '/sale-payments',\n  salePaymentRoutes,\n);\n\nrouter.use(\n  '/purchase-payments',\n  purchasePaymentRoutes,\n);\n"
);

fs.writeFileSync(path, s);
console.log("registered /sale-payments + /purchase-payments OK");
