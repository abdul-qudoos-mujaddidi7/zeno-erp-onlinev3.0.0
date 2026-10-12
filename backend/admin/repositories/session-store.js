const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

// Reuse the existing sessions table and mysql2 pool; no runtime DDL or new pool.
module.exports = function createSessionStore(pool) {
  return new MySQLStore({
    createDatabaseTable: false,
    clearExpired: false,
    endConnectionOnClose: false,
    expiration: 4 * 60 * 60 * 1000,
  }, pool);
};
