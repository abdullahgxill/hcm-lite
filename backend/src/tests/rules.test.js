import test from "node:test";
import assert from "node:assert/strict";
import {
  workingDays,
  attendanceStatus,
  taxCents,
  payrollLine,
  dateRange,
} from "../services/rules.js";
import { canUseTool } from "../services/ai.js";
const rules = {
  timezone: "Asia/Karachi",
  officeStart: "09:00",
  officeEnd: "18:00",
  graceMinutes: 15,
  halfDayHours: 5,
  weekends: [0, 6],
  holidays: ["2026-10-14"],
  leaveTypes: [],
};
test("working days exclude weekends and public holidays", () =>
  assert.deepEqual(workingDays("2026-10-09", "2026-10-14", rules), [
    "2026-10-09",
    "2026-10-12",
    "2026-10-13",
  ]));
test("09:15 is on time, 09:16 is late; exactly five hours is not half day", () => {
  assert.equal(
    attendanceStatus("2026-10-12T04:15:00Z", "2026-10-12T09:15:00Z", rules)
      .status,
    "present",
  );
  assert.equal(
    attendanceStatus("2026-10-12T04:16:00Z", "2026-10-12T09:16:00Z", rules)
      .status,
    "late",
  );
  assert.equal(
    attendanceStatus("2026-10-12T04:15:00Z", "2026-10-12T09:14:00Z", rules)
      .status,
    "half_day",
  );
  assert.equal(
    attendanceStatus("2026-10-12T04:15:00Z", null, rules).status,
    "missing_checkout",
  );
});
test("illustrative tax slabs and boundaries", () => {
  for (const [gross, tax] of [
    [600000, 0],
    [1200000, 30000],
    [2400000, 210000],
    [3600000, 510000],
    [4800000, 930000],
    [900000, 15000],
    [1800000, 120000],
    [3000000, 360000],
  ])
    assert.equal(taxCents(gross * 100), tax * 100);
});
test("payroll exact gross, paid leave, unpaid, absence, half days and rounding", () => {
  const e = {
    _id: "e",
    name: "Test",
    code: "T",
    department: "Engineering",
    designation: "Developer",
    joiningDate: "2026-10-01",
    basicCents: 10000000,
  };
  const days = workingDays("2026-10-01", "2026-10-31", rules),
    att = days.slice(3).map((date) => ({ date, status: "present" }));
  att[0].status = "half_day";
  const ls = [
    { status: "approved", days: [days[1]], paid: true },
    { status: "approved", days: [days[2]], paid: false },
  ];
  const p = payrollLine(e, "2026-10", rules, att, ls);
  assert.equal(p.grossCents, 15000000);
  assert.equal(p.hraCents, 4000000);
  assert.equal(p.medicalCents, 1000000);
  assert.equal(p.absent, 1);
  assert.equal(p.unpaid, 1);
  assert.equal(p.halfDays, 1);
  assert.equal(p.deductionCents, Math.round((15000000 * 2.5) / days.length));
  assert.equal(p.taxCents, 1000000);
  assert.equal(p.netCents, p.grossCents - p.deductionCents - p.taxCents);
});
test("joiners and leavers prorate only eligible working days", () => {
  const e = {
    _id: "e",
    joiningDate: "2026-10-12",
    leavingDate: "2026-10-23",
    basicCents: 10000000,
  };
  const days = workingDays(e.joiningDate, e.leavingDate, rules),
    p = payrollLine(
      e,
      "2026-10",
      rules,
      days.map((date) => ({ date, status: "present" })),
      [],
    );
  assert.equal(p.eligibleDays, days.length);
  assert.equal(
    p.proratedGrossCents,
    Math.round((15000000 * days.length) / p.workingDays),
  );
  assert.equal(p.absent, 0);
});
test("AI tool authorization follows roles", () => {
  assert.equal(canUseTool({ role: "EMPLOYEE" }, "get_headcount"), false);
  assert.equal(canUseTool({ role: "EMPLOYEE" }, "get_late_comers"), false);
  assert.equal(canUseTool({ role: "EMPLOYEE" }, "get_payroll_summary"), true);
  assert.equal(canUseTool({ role: "HR" }, "get_headcount"), true);
  assert.equal(canUseTool({ role: "ADMIN" }, "drop_database"), false);
});
test("date ranges cannot expand into an unbounded query", () =>
  assert.throws(() => dateRange("2020-01-01", "2026-10-24")));
