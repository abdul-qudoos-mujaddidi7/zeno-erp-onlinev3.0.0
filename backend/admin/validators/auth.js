const { z } = require('zod');
const { language } = require('./preferences');

const username = z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).transform(value => value.toLowerCase());
// Never silently truncate Unicode passwords at bcrypt's 72-byte limit.
const password = z.string().min(12).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72 && !value.includes('\0'));
const login = z.object({ username, password, language, _csrf: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const provisioning = z.object({ username, displayName: z.string().trim().min(1).max(120), password }).strict();
const sessionIdentity = z.object({ id: z.number().int().positive().max(4294967295), authVersion: z.number().int().positive() }).strict();
module.exports = { username, password, login, provisioning, sessionIdentity };
