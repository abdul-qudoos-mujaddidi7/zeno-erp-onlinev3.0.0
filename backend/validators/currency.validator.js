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

const currencyBodySchema = z.object({
  name: z
    .string({
      required_error: 'Currency name is required.',
    })
    .trim()
    .min(1, 'Currency name is required.')
    .max(255, 'Currency name is too long.'),

  code: z
    .string({
      required_error: 'Currency code is required.',
    })
    .trim()
    .min(1, 'Currency code is required.')
    .max(50, 'Currency code is too long.'),

  symbol: nullableString(50),

  isDefault: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(0),

  exchangeRate: z
    .coerce
    .number()
    .min(0)
    .default(1),

  exchangeRateDate: nullableString(40),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const currencyIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const currencyListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  search: z
    .string()
    .trim()
    .max(255)
    .optional()
    .default(''),
});

module.exports = {
  createCurrencySchema: currencyBodySchema,
  updateCurrencySchema: currencyBodySchema,
  currencyIdParamsSchema,
  currencyListQuerySchema,
};
