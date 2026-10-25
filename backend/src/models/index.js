import mongoose from "mongoose";
const { Schema } = mongoose;
const model = (name, shape, indexes = []) => {
  const s = new Schema(shape, { timestamps: true, strict: true });
  for (const [keys, options] of indexes) s.index(keys, options);
  return mongoose.model(name, s);
};
const ref = (name, required = false) => ({
  type: Schema.Types.ObjectId,
  ref: name,
  required,
});
export const Company = model("Company", {
  _id: { type: String, default: "company" },
  name: String,
  ledgerVersion: { type: Number, default: 0 },
  timezone: { type: String, default: "Asia/Karachi" },
  officeStart: { type: String, default: "09:00" },
  officeEnd: { type: String, default: "18:00" },
  graceMinutes: { type: Number, default: 15 },
  halfDayHours: { type: Number, default: 5 },
  weekends: { type: [Number], default: [0, 6] },
  latitude: Number,
  longitude: Number,
  radius: { type: Number, default: 150 },
  departments: [String],
  designations: [String],
  holidays: [String],
  leaveTypes: {
    type: [{ name: String, quota: Number, paid: Boolean }],
    default: () => [
      { name: "annual", quota: 14, paid: true },
      { name: "sick", quota: 8, paid: true },
      { name: "casual", quota: 10, paid: true },
      { name: "unpaid", quota: null, paid: false },
    ],
  },
  revisions: [Schema.Types.Mixed],
});
export const User = model("User", {
  name: String,
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ["ADMIN", "HR", "EMPLOYEE"], required: true },
  employeeId: ref("Employee"),
  active: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0 },
});
export const Employee = model("Employee", {
  code: { type: String, required: true, unique: true },
  userId: ref("User", true),
  name: String,
  email: { type: String, required: true, unique: true },
  department: String,
  designation: String,
  joiningDate: String,
  leavingDate: String,
  status: {
    type: String,
    enum: ["active", "probation", "inactive"],
    default: "active",
  },
  gender: {
    type: String,
    enum: ["female", "male", "other", "unspecified"],
    default: "unspecified",
  },
  phone: String,
  address: String,
  basicCents: { type: Number, min: 1 },
  quotaVersion: { type: Number, default: 0 },
});
export const Attendance = model(
  "Attendance",
  {
    employeeId: ref("Employee", true),
    date: String,
    checkIn: Date,
    checkOut: Date,
    late: Boolean,
    hours: Number,
    status: String,
    rules: Schema.Types.Mixed,
    source: { type: String, default: "web" },
    checkInVerification: { faceCount: Number, accuracyMeters: Number, distanceMeters: Number, checkedAt: Date },
    checkOutVerification: { faceCount: Number, accuracyMeters: Number, distanceMeters: Number, checkedAt: Date },
  },
  [[{ employeeId: 1, date: 1 }, { unique: true }]],
);
export const Correction = model("Correction", {
  employeeId: ref("Employee", true),
  date: String,
  checkIn: Date,
  checkOut: Date,
  reason: String,
  status: { type: String, default: "pending" },
  comment: String,
  decidedBy: ref("User"),
});
export const Leave = model(
  "Leave",
  {
    employeeId: ref("Employee", true),
    type: String,
    start: String,
    end: String,
    days: [String],
    paid: Boolean,
    quota: Number,
    reason: String,
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },
    comment: String,
    decidedBy: ref("User"),
    rules: Schema.Types.Mixed,
  },
  [[{ employeeId: 1, start: 1, end: 1 }, {}]],
);
export const Payroll = model("Payroll", {
  sourceVersion: Number,
  month: { type: String, unique: true },
  status: { type: String, enum: ["draft", "finalized"], default: "draft" },
  lines: [Schema.Types.Mixed],
  rules: Schema.Types.Mixed,
  finalizedBy: ref("User"),
  finalizedAt: Date,
  revision: { type: Number, default: 1 },
});
export const Announcement = model("Announcement", {
  title: String,
  body: String,
  actor: ref("User"),
});
export const Notification = model("Notification", {
  userId: ref("User", true),
  title: String,
  body: String,
  read: { type: Boolean, default: false },
});
export const Audit = model("Audit", {
  actor: ref("User"),
  actorName: String,
  action: String,
  entity: String,
  entityId: String,
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
});
export const AILog = model("AILog", {
  userId: ref("User"),
  kind: String,
  outcome: String,
  tools: [String],
  durationMs: Number,
});
export const RateBucket = model(
  "RateBucket",
  { _id: String, count: Number, expiresAt: Date },
  [[{ expiresAt: 1 }, { expireAfterSeconds: 0 }]],
);
