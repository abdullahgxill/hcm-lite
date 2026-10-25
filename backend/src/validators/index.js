import { z } from "zod";
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Use a real ISO date",
  );
const text = z.string().trim().min(1).max(150);
export const password = z
  .string()
  .min(10)
  .max(128)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Use at most 72 UTF-8 bytes")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const setupSchema = z.object({
  companyName: text,
  name: text,
  email: z
    .string()
    .trim()
    .email()
    .transform((v) => v.toLowerCase()),
  password,
});
export const employeeSchema = z
  .object({
    name: text,
    code: text,
    email: z
      .string()
      .trim()
      .email()
      .transform((v) => v.toLowerCase()),
    department: text,
    designation: text,
    joiningDate: isoDate,
    leavingDate: isoDate.optional().nullable(),
    basic: z.coerce.number().positive().max(1e9),
    gender: z
      .enum(["female", "male", "other", "unspecified"])
      .default("unspecified"),
    status: z.enum(["active", "probation", "inactive"]).default("active"),
    phone: z.string().max(40).default(""),
    address: z.string().max(500).default(""),
  })
  .refine((v) => !v.leavingDate || v.leavingDate >= v.joiningDate, {
    path: ["leavingDate"],
    message: "Leaving date must follow joining date",
  });
export const leaveSchema = z
  .object({
    type: text,
    start: isoDate,
    end: isoDate,
    reason: z.string().trim().min(3).max(1000),
  })
  .refine(
    (v) => v.start <= v.end && v.start.slice(0, 4) === v.end.slice(0, 4),
    { message: "Use an ordered range within one calendar year" },
  );
export const settingsSchema = z
  .object({
    name: text,
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone"),
    officeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    officeEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    graceMinutes: z.coerce.number().int().min(0).max(120),
    halfDayHours: z.coerce.number().min(1).max(12),
    weekends: z.array(z.number().int().min(0).max(6)).max(6),
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    radius: z.coerce.number().min(1).max(10000),
    departments: z.array(text).max(100),
    designations: z.array(text).max(100),
    holidays: z.array(isoDate).max(366),
    leaveTypes: z
      .array(
        z.object({
          name: text,
          quota: z.number().int().min(0).nullable(),
          paid: z.boolean(),
        }),
      )
      .min(1)
      .max(20),
  })
  .refine((v) => v.officeEnd > v.officeStart, {
    message: "Office end must be after office start (same-day shifts)",
  })
  .refine((v) => (v.latitude == null) === (v.longitude == null), { message: "Provide both office latitude and longitude, or leave both empty." })
  .refine(
    (v) =>
      new Set(v.leaveTypes.map((t) => t.name)).size === v.leaveTypes.length &&
      v.leaveTypes.every((t) => !t.paid || t.quota !== null),
    { message: "Leave type names must be unique; paid leave needs a quota" },
  );
export const validate = (schema) => (req, res, next) => {
  req.body = schema.parse(req.body);
  next();
};
