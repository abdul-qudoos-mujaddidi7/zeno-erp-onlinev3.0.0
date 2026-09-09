const { z } = require('zod');

const nullableString = (maxLength) =>
  z.preprocess(
    (value) => {
      if (value === '' || value === undefined) {
        return null;
      }

      return value;
    },
    z
      .string()
      .trim()
      .max(maxLength)
      .nullable(),
  );

/*
 * Settings values are stored as text. The UI often sends booleans/ints
 * as numbers (0, 1, 25), so coerce them before validation.
 */
const settingValueSchema = z.preprocess(
  (value) => {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    return String(value);
  },
  z
    .string()
    .max(12_000_000, 'Setting value is too long.')
    .nullable(),
);

const settingFields = {
  category: nullableString(50),

  type: nullableString(50),

  key: z
    .string({
      required_error: 'Setting key is required.',
    })
    .trim()
    .min(1, 'Setting key is required.')
    .max(255, 'Setting key is too long.'),

  /*
   * value is longtext in MySQL and may hold large payloads
   * (e.g. base64 company logos), so allow up to ~12 MB.
   */
  value: settingValueSchema.optional(),

  description: nullableString(65535),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
};

const createSettingSchema = z.object({
  ...settingFields,
  value: settingValueSchema.optional().default(null),
});

const updateSettingSchema = z
  .object(settingFields)
  .partial();

const settingIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const settingListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  key: z
    .string()
    .trim()
    .max(255)
    .optional()
    .default(''),

  search: z
    .string()
    .trim()
    .max(255)
    .optional()
    .default(''),
});

module.exports = {
  createSettingSchema,
  updateSettingSchema,
  settingIdParamsSchema,
  settingListQuerySchema,
};
