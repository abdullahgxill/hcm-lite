import { assert } from "../utils/errors.js";
export const round = (n) => Math.round(n + Number.EPSILON);
export const cents = (value) => round(Number(value) * 100);
export const money = (value) => Number((value / 100).toFixed(2));
export function localDate(time = new Date(), timezone = "Asia/Karachi") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
}
export function localMinutes(time, timezone) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(time)
    .split(":");
  return Number(p[0]) * 60 + Number(p[1]);
}
export function dateRange(start, end) {
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(start) &&
      /^\d{4}-\d{2}-\d{2}$/.test(end) &&
      start <= end &&
      !isNaN(Date.parse(start)) &&
      !isNaN(Date.parse(end)) &&
      new Date(start + "T00:00:00Z").toISOString().slice(0, 10) === start &&
      new Date(end + "T00:00:00Z").toISOString().slice(0, 10) === end,
    422,
    "Use a valid ordered ISO date range.",
  );
  const days = [];
  let d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  assert(
    !isNaN(d) && !isNaN(last) && last - d <= 366 * 86400000,
    422,
    "Date range must be at most 366 days.",
  );
  while (d <= last) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}
export function workingDays(start, end, rules) {
  return dateRange(start, end).filter(
    (d) =>
      !rules.weekends.includes(new Date(`${d}T12:00:00Z`).getUTCDay()) &&
      !rules.holidays.includes(d),
  );
}
export const ruleSnapshot = (c) => ({
  timezone: c.timezone,
  officeStart: c.officeStart,
  officeEnd: c.officeEnd,
  graceMinutes: c.graceMinutes,
  halfDayHours: c.halfDayHours,
  weekends: [...c.weekends],
  holidays: [...c.holidays],
  leaveTypes: c.leaveTypes.map((t) => ({
    name: t.name,
    quota: t.quota,
    paid: t.paid,
  })),
});
export function rulesOn(company, date) {
  const revision = [...(company.revisions || [])]
    .reverse()
    .find((r) => r.effectiveDate <= date);
  return revision?.rules || ruleSnapshot(company);
}
export function attendanceStatus(checkIn, checkOut, rules) {
  const [h, m] = rules.officeStart.split(":").map(Number);
  const late =
    localMinutes(new Date(checkIn), rules.timezone) >
    h * 60 + m + rules.graceMinutes;
  const hours = checkOut
    ? (new Date(checkOut) - new Date(checkIn)) / 3600000
    : 0;
  return {
    late,
    hours,
    status: !checkOut
      ? "missing_checkout"
      : hours < rules.halfDayHours
        ? "half_day"
        : late
          ? "late"
          : "present",
  };
}
export function taxCents(annual) {
  if (annual <= 60000000) return 0;
  if (annual <= 120000000) return round((annual - 60000000) * 0.05);
  if (annual <= 240000000) return 3000000 + round((annual - 120000000) * 0.15);
  if (annual <= 360000000) return 21000000 + round((annual - 240000000) * 0.25);
  return 51000000 + round((annual - 360000000) * 0.35);
}
export function payrollLine(employee, month, company, attendance, leaves) {
  const start = `${month}-01`;
  const end = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  const all = dateRange(start, end).filter(
    (d) => workingDays(d, d, rulesOn(company, d)).length,
  );
  const eligible = all.filter(
    (d) =>
      d >= employee.joiningDate &&
      (!employee.leavingDate || d <= employee.leavingDate),
  );
  const grossCents = round(employee.basicCents * 1.5),
    hraCents = round(employee.basicCents * 0.4),
    medicalCents = grossCents - employee.basicCents - hraCents;
  let absent = 0,
    unpaid = 0,
    halfDays = 0;
  for (const date of eligible) {
    const leave = leaves.find(
      (l) => l.status === "approved" && l.days.includes(date),
    );
    const a = attendance.find((a) => a.date === date);
    if (leave) {
      if (!leave.paid) unpaid++;
    } else if (!a) absent++;
    else if (a.status === "half_day") halfDays++;
  }
  const proratedGrossCents = all.length
    ? round((grossCents * eligible.length) / all.length)
    : 0;
  const deductionCents = all.length
    ? round((grossCents * (absent + unpaid + 0.5 * halfDays)) / all.length)
    : 0;
  // Tax is on gross annualized as specified, then prorated for joiners/leavers.
  const monthlyTaxCents = round(taxCents(grossCents * 12) / 12);
  const tax = all.length
    ? round((monthlyTaxCents * eligible.length) / all.length)
    : 0;
  return {
    employeeId: String(employee._id),
    name: employee.name,
    code: employee.code,
    department: employee.department,
    designation: employee.designation,
    basicCents: employee.basicCents,
    hraCents,
    medicalCents,
    grossCents,
    proratedGrossCents,
    workingDays: all.length,
    eligibleDays: eligible.length,
    absent,
    unpaid,
    halfDays,
    perDayCents: all.length ? grossCents / all.length : 0,
    deductionCents,
    taxCents: tax,
    netCents: Math.max(0, proratedGrossCents - deductionCents - tax),
  };
}
