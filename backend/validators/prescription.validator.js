const { z } = require('zod');

const {
  paginationQuerySchema,
} = require('../utils/pagination');

const nullableString = (maxLength) =>
  z.preprocess(
    (value) => {
      if (value === '' || value === undefined || value === null) {
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

const nullableNumber = () =>
  z.preprocess(
    (value) => {
      if (value === '' || value === undefined || value === null) {
        return null;
      }

      const number = Number(value);

      return Number.isFinite(number) ? number : null;
    },
    z
      .number()
      .nullable(),
  );

const prescriptionItemSchema = z.object({
  product_id: nullableNumber(),
  product_unit_id: nullableNumber(),
  dosage: nullableString(255),
  dosage_unit: nullableString(100),
  frequency: nullableString(255),
  duration: nullableString(100),
  duration_unit: nullableString(100),
  route: nullableString(100),
  instructions: nullableString(65535),
  quantity: nullableNumber(),
  unit_price: nullableNumber(),
  currency: nullableString(50),
  subtotal: nullableNumber(),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const prescriptionBodySchema = z.object({
  prescription_number: nullableString(255),
  prescription_status: nullableString(50),
  prescription_date: nullableString(50),
  patient_id: nullableNumber(),
  doctor_id: nullableNumber(),
  appointment_id: nullableNumber(),
  warehouse_id: nullableNumber(),
  account_id: nullableNumber(),
  vitals: nullableString(65535),
  diagnosis: nullableString(65535),
  notes: nullableString(65535),
  description: nullableString(65535),
  total_amount: nullableNumber(),
  discount_type: nullableString(63),
  discount_amount: nullableNumber(),
  currency: nullableString(50),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
  items: z
    .array(prescriptionItemSchema)
    .optional(),
});

const paymentBodySchema = z.object({
  prescription_id: nullableNumber(),
  account_id: nullableNumber(),
  amount: nullableNumber(),
  currency: nullableString(50),
  payment_date: nullableString(50),
  description: nullableString(65535),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const returnItemSchema = z.object({
  product_id: nullableNumber(),
  product_unit_id: nullableNumber(),
  quantity: nullableNumber(),
  unit_price: nullableNumber(),
  currency: nullableString(50),
  subtotal: nullableNumber(),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const returnBodySchema = z.object({
  prescription_id: nullableNumber(),
  warehouse_id: nullableNumber(),
  account_id: nullableNumber(),
  return_number: nullableString(255),
  return_date: nullableString(50),
  total_amount: nullableNumber(),
  description: nullableString(65535),
  currency: nullableString(50),
  return_status: nullableString(50),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
  items: z
    .array(returnItemSchema)
    .optional()
    .default([]),
});

const idParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const paymentParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
  paymentId: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const returnParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
  returnId: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const prescriptionListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  prescription_status: z
    .string()
    .trim()
    .max(50)
    .optional()
    .default(''),

  patient_id: z
    .preprocess(
      (value) => {
        if (value === '' || value === undefined || value === null) {
          return '';
        }

        return value;
      },
      z.union([
        z.literal(''),
        z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      ]),
    )
    .optional()
    .default(''),

  doctor_id: z
    .preprocess(
      (value) => {
        if (value === '' || value === undefined || value === null) {
          return '';
        }

        return value;
      },
      z.union([
        z.literal(''),
        z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      ]),
    )
    .optional()
    .default(''),

  appointment_id: z
    .preprocess(
      (value) => {
        if (value === '' || value === undefined || value === null) {
          return '';
        }

        return value;
      },
      z.union([
        z.literal(''),
        z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      ]),
    )
    .optional()
    .default(''),

  search: z
    .string()
    .trim()
    .max(255)
    .optional()
    .default(''),

  relations: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(0),
}).merge(paginationQuerySchema);

module.exports = {
  createPrescriptionSchema: prescriptionBodySchema,
  updatePrescriptionSchema: prescriptionBodySchema.partial(),
  prescriptionIdParamsSchema: idParamsSchema,
  prescriptionListQuerySchema,
  createPaymentSchema: paymentBodySchema,
  paymentParamsSchema,
  createReturnSchema: returnBodySchema,
  returnParamsSchema,
};
