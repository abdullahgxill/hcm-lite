import { Employee, Leave, Company, Payroll } from "../models/index.js";
import { lockLedger } from "./locking.js";
import { assert } from "../utils/errors.js";
import { workingDays, ruleSnapshot } from "./rules.js";
export async function balance(employeeId, year, session) {
  const company = await Company.findById("company").session(session || null);
  const leaves = await Leave.find({
    employeeId,
    status: "approved",
    start: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
  }).session(session || null);
  return company.leaveTypes.map((t) => {
    const used = leaves
      .filter((l) => l.type === t.name)
      .reduce((n, l) => n + l.days.length, 0);
    return {
      type: t.name,
      quota: t.quota,
      used,
      remaining: t.quota === null ? null : Math.max(0, t.quota - used),
    };
  });
}
export async function assertUnlockedDates(dates, session) {
  if (session) await lockLedger(session);
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
  assert(
    !(await Payroll.exists({
      month: { $in: months },
      status: "finalized",
    }).session(session || null)),
    409,
    "Attendance and leave in a finalized payroll month are locked.",
  );
}
export async function validateLeave(employeeId, data, session, excludeId) {
  // Serialize all leave writes for an employee to prevent concurrent approval overspending.
  const employee = await Employee.findByIdAndUpdate(
    employeeId,
    { $inc: { quotaVersion: 1 } },
    { session, new: true },
  );
  assert(employee, 404, "Employee profile not found.");
  const c = await Company.findById("company").session(session);
  const type = c.leaveTypes.find((t) => t.name === data.type);
  assert(type, 422, "Unknown leave type.");
  const days = data.days || workingDays(data.start, data.end, c);
  assert(days.length > 0, 422, "The selected range has no working days.");
  assert(
    days.every(
      (d) =>
        d >= employee.joiningDate &&
        (!employee.leavingDate || d <= employee.leavingDate),
    ),
    422,
    "Leave must fall within employment dates.",
  );
  await assertUnlockedDates(days, session);
  const overlapping = await Leave.exists({
    employeeId,
    status: { $in: ["pending", "approved"] },
    days: { $in: days },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).session(session);
  assert(
    !overlapping,
    422,
    "Leave overlaps an existing pending or approved request.",
  );
  const year = data.start.slice(0, 4);
  const approved = await Leave.find({
    employeeId,
    type: data.type,
    status: "approved",
    start: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).session(session);
  const used = approved.reduce((n, l) => n + l.days.length, 0);
  const quota = data.quota === undefined ? type.quota : data.quota;
  assert(
    quota === null || used + days.length <= quota,
    422,
    "Insufficient leave balance.",
  );
  return {
    days,
    paid: data.paid ?? type.paid,
    quota,
    rules: data.rules || ruleSnapshot(c),
  };
}
