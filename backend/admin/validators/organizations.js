const { z } = require('zod');
const { language } = require('./preferences');
const id = z.string().regex(/^[1-9][0-9]{0,9}$/).transform(Number).refine(value => value <= 2147483647);
const list = z.object({
  q: z.string().trim().max(120).default(''),
  type: z.string().trim().max(255).default(''),
  status: z.enum(['all', '1', '0']).default('all'),
  inventory: z.enum(['all', 'CLASSIC', 'FIFO', 'LIFO']).default('all'),
  sort: z.enum(['id', 'name', 'type', 'status', 'created_at']).default('id'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.string().regex(/^[1-9][0-9]{0,5}$/).transform(Number).default(1),
  pageSize: z.enum(['10', '25', '50', '100']).transform(Number).default(25),
  lang: language.optional(),
}).strict();
const selection = z.object({ organizationId: z.union([z.literal('all'), id]), _csrf: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
module.exports = { id, list, selection };
