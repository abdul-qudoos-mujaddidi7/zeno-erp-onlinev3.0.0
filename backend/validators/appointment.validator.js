const { z } = require('zod');

const {
  paginationQuerySchema,
} = require('../utils/pagination');

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

const appointmentItemSchema = z.object({
  product_id: nullableNumber(),
  product_unit_id: nullableNumber(),
  quantity: nullableNumber(),
  unit_price: nullableNumber(),
  currency: nullableString(50),
  discount_type: nullableString(63),
  discount_amount: nullableNumber(),
  subtotal: nullableNumber(),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const appointmentBodySchema = z.object({
  date: nullableString(50),
  serial_no: nullableString(255),
  reference_id: nullableNumber(),
  reference_type: nullableString(100),
  description: nullableString(65535),
  patient_id: nullableNumber(),
  fee: nullableNumber(),
  paid_amount: nullableNumber(),
  currency: nullableString(50),
  doctor_id: nullableNumber(),
  department_id: nullableNumber(),
  visit_type: nullableString(100),
  visit_status: nullableString(100),
  visit_date: nullableString(50),
  doctor_notes: nullableString(65535),
  diagnosis: nullableString(65535),
  prescriptions: nullableString(65535),
  vitals: nullableString(65535),
  parent_visit_id: nullableNumber(),
  follow_up_date: nullableString(50),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
  items: z
    .array(appointmentItemSchema)
    .optional()
    .default([]),
});

const appointmentIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const appointmentListQuerySchema = z.object({
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

  patient_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

  doctor_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

  department_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

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
  createAppointmentSchema: appointmentBodySchema,
  updateAppointmentSchema: appointmentBodySchema,
  appointmentIdParamsSchema,
  appointmentListQuerySchema,
};
