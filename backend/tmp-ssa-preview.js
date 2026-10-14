require("dotenv").config();
const express = require("express");
const createSmartSuperAdmin = require("./smart-super-admin/app");
const app = express();
app.use("/smart-super-admin", createSmartSuperAdmin({ skipAccessControl: true }));
const port = 4321;
app.listen(port, () => console.log("preview on http://localhost:" + port + "/smart-super-admin/list/products/id/DESC/0/20/1"));
