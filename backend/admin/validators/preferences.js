const { z } = require('zod');
exports.language = z.enum(['en', 'fa', 'ps']);
exports.preferences = z.object({ language: exports.language, _csrf: z.string().length(64) }).strict();
