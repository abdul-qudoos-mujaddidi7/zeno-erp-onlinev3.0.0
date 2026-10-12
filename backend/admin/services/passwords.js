const bcrypt = require('bcryptjs');
const { randomBytes } = require('node:crypto');
const { password } = require('../validators/auth');
const COST = 12;
let dummyHash;

exports.hash = async value => bcrypt.hash(password.parse(value), COST);
exports.verify = async (value, encoded) => {
  // Unknown accounts perform the same expensive comparison as known accounts.
  if (!dummyHash) dummyHash = bcrypt.hash(randomBytes(24).toString('base64'), COST);
  const validEncoding = typeof encoded === 'string' && /^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(encoded);
  const match = await bcrypt.compare(value, validEncoding ? encoded : await dummyHash);
  return validEncoding && match;
};
exports.COST = COST;
