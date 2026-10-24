import {
  Employee,
  Attendance,
  Leave,
  Payroll,
  Company,
  Correction,
  Audit,
  Announcement,
} from "../models/index.js";
import { dateRange, localDate, rulesOn, workingDays } from "./rules.js";
import { ownId } from "../middleware/auth.js";
export async function analytics(user, filters = {}) {
  const c = await Company.findById("company").lean();
  const today = localDate(new Date(), c.timezone);
  const start = filters.start || `${today.slice(0, 7)}-01`,
    end = filters.end || today;
  const range = dateRange(start, end);
  const query = {
    ...(filters.department ? { department: filters.department } : {}),
    ...(user.role === "EMPLOYEE" ? { _id: ownId(user) } : {}),
  };
  const employees = await Employee.find(query).lean();
  const ids = employees.map((e) => e._id);
  const [att, leaves, payrollGroups, announcements] = await Promise.all([
    Attendance.find({
      employeeId: { $in: ids },
      date: { $gte: start, $lte: end },
    }).lean(),
    Leave.find({
      employeeId: { $in: ids },
      start: { $lte: end },
      end: { $gte: start },
    }).lean(),
    Payroll.aggregate([
      {
        $match: {
          status: "finalized",
          month: { $gte: start.slice(0, 7), $lte: end.slice(0, 7) },
        },
      },
      { $unwind: "$lines" },
      { $match: { "lines.employeeId": { $in: ids.map(String) } } },
      {
        $group: {
          _id: "$lines.department",
          grossCents: { $sum: "$lines.proratedGrossCents" },
          netCents: { $sum: "$lines.netCents" },
        },
      },
    ]),
    Announcement.find().sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  const activeOn = (d) =>
    employees.filter(
      (e) =>
        e.joiningDate <= d &&
        (!e.leavingDate || e.leavingDate >= d) &&
        (e.status !== "inactive" || !!e.leavingDate),
    );
  const headcount = activeOn(end).length,
    opening = activeOn(start).length;
  const ytdStart = `${end.slice(0, 4)}-01-01`,
    ytdOpening = activeOn(ytdStart).length,
    ytdExits = employees.filter(
      (e) => e.leavingDate && e.leavingDate >= ytdStart && e.leavingDate <= end,
    ).length;
  const exits = employees.filter(
    (e) => e.leavingDate && e.leavingDate >= start && e.leavingDate <= end,
  ).length;
  let expected = 0,
    onLeave = 0,
    present = 0,
    late = 0,
    missing = 0,
    half = 0,
    absent = 0;
  const dept = {},
    trend = [],
    todayCounts = { present: 0, late: 0, onLeave: 0 };
  const lateMap = {};
  for (const date of range.filter((d) => d <= today)) {
    let dailyExpected = 0,
      dailyPresent = 0;
    for (const e of activeOn(date)) {
      if (!workingDays(date, date, rulesOn(c, date)).length) continue;
      const key = String(e._id),
        d = (dept[e.department] ??= {
          department: e.department,
          expected: 0,
          absent: 0,
          present: 0,
          late: 0,
        });
      expected++;
      dailyExpected++;
      d.expected++;
      const l = leaves.find(
        (l) =>
          String(l.employeeId) === key &&
          l.status === "approved" &&
          l.days.includes(date),
      );
      const a = att.find(
        (a) => String(a.employeeId) === key && a.date === date,
      );
      if (l) {
        onLeave++;
        if (date === today) todayCounts.onLeave++;
        continue;
      }
      if (!a) {
        absent++;
        d.absent++;
        continue;
      }
      if (a.status === "half_day") {
        half++;
        dailyPresent += 0.5;
        d.present += 0.5;
      } else {
        dailyPresent++;
        d.present++;
        if (!a.checkOut && date < today) missing++;
        else if (a.late) late++;
        else present++;
      }
      if (a.late) {
        d.late++;
        lateMap[key] = (lateMap[key] || 0) + 1;
      }
      if (date === today) {
        todayCounts.present++;
        if (a.late) todayCounts.late++;
      }
    }
    trend.push({ date, present: dailyPresent, expected: dailyExpected });
  }
  const approvedDays = leaves
    .filter((l) => l.status === "approved")
    .flatMap((l) => l.days.filter((d) => d >= start && d <= end)).length;
  const leaveUtilization = c.leaveTypes.map((t) => {
    const used = leaves
      .filter((l) => l.type === t.name && l.status === "approved")
      .reduce(
        (n, l) => n + l.days.filter((d) => d >= start && d <= end).length,
        0,
      );
    const quota = t.quota === null ? null : t.quota * headcount;
    return {
      type: t.name,
      days: used,
      quota,
      utilization: quota ? (used / quota) * 100 : 0,
    };
  });
  const leaveByDepartment = [
    ...new Set(employees.map((e) => e.department)),
  ].flatMap((department) =>
    c.leaveTypes.map((t) => {
      const deptIds = new Set(
        employees
          .filter((e) => e.department === department)
          .map((e) => String(e._id)),
      );
      const days = leaves
        .filter(
          (l) =>
            deptIds.has(String(l.employeeId)) &&
            l.status === "approved" &&
            l.type === t.name,
        )
        .reduce(
          (n, l) => n + l.days.filter((d) => d >= start && d <= end).length,
          0,
        );
      const quota =
        t.quota === null
          ? null
          : t.quota *
            activeOn(end).filter((e) => e.department === department).length;
      return {
        department,
        type: t.name,
        days,
        quota,
        utilization: quota ? (days / quota) * 100 : 0,
      };
    }),
  );
  const groups = Object.values(dept).map((d) => ({
    ...d,
    absenteeism: d.expected ? (d.absent / d.expected) * 100 : 0,
  }));
  const active = activeOn(end),
    gross = active.reduce((n, e) => n + Math.round(e.basicCents * 1.5), 0);
  const topLate = Object.entries(lateMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({
      name: employees.find((e) => String(e._id) === id)?.name,
      count,
    }));
  const pendingApprovals =
    user.role === "EMPLOYEE"
      ? 0
      : (await Leave.countDocuments({
          employeeId: { $in: ids },
          status: "pending",
        })) +
        (await Correction.countDocuments({
          employeeId: { $in: ids },
          status: "pending",
        }));
  const departmentBreakdown = await Employee.aggregate([
    { $match: { _id: { $in: active.map((e) => e._id) } } },
    {
      $group: {
        _id: "$department",
        headcount: { $sum: 1 },
        averageGrossCents: { $avg: { $multiply: ["$basicCents", 1.5] } },
      },
    },
  ]);
  const designationBreakdown = await Employee.aggregate([
    { $match: { _id: { $in: active.map((e) => e._id) } } },
    {
      $group: {
        _id: "$designation",
        averageGrossCents: { $avg: { $multiply: ["$basicCents", 1.5] } },
      },
    },
  ]);
  const genderBreakdown = Object.entries(
    active.reduce((a, e) => ((a[e.gender] = (a[e.gender] || 0) + 1), a), {}),
  ).map(([name, value]) => ({ name, value }));
  const tenure = active.map((e) => ({
    name: e.name,
    months: Math.max(
      0,
      Math.floor((new Date(end) - new Date(e.joiningDate)) / 2629800000),
    ),
  }));
  const summary = {
    filters: { start, end, department: filters.department || null },
    headcount,
    attritionYTD:
      ytdOpening + headcount
        ? (ytdExits / ((ytdOpening + headcount) / 2)) * 100
        : 0,
    attrition:
      opening + headcount ? (exits / ((opening + headcount) / 2)) * 100 : 0,
    presentToday: todayCounts.present,
    lateToday: todayCounts.late,
    onLeaveToday: todayCounts.onLeave,
    pendingApprovals,
    attendanceRate:
      expected - onLeave
        ? ((present + late + missing + 0.5 * half) / (expected - onLeave)) * 100
        : 0,
    latePercent: present + late ? (late / (present + late)) * 100 : 0,
    absenteeism: expected ? (absent / expected) * 100 : 0,
    expectedDays: expected,
    absentDays: absent,
    approvedDays,
    payrollGrossCents: payrollGroups.reduce((n, d) => n + d.grossCents, 0),
    payrollNetCents: payrollGroups.reduce((n, d) => n + d.netCents, 0),
    averageGrossCents: headcount ? Math.round(gross / headcount) : 0,
    departmentBreakdown,
    designationBreakdown,
    payrollByDepartment: payrollGroups,
    genderBreakdown,
    tenure,
    attendanceTrend: trend,
    absenteeismByDepartment: groups,
    leaveUtilization,
    leaveByDepartment,
    topLate,
    announcements,
  };
  if (user.role === "ADMIN")
    summary.auditFeed = await Audit.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();
  if (user.role === "EMPLOYEE") {
    const eid = String(ownId(user)),
      weekStart = new Date(`${today}T12:00:00Z`);
    weekStart.setUTCDate(
      weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7),
    );
    const week = await Attendance.find({
      employeeId: eid,
      date: { $gte: weekStart.toISOString().slice(0, 10), $lte: today },
    }).lean();
    summary.weekHours = week.reduce(
      (n, a) =>
        n +
        (a.checkOut ? a.hours : (Date.now() - new Date(a.checkIn)) / 3600000),
      0,
    );
    summary.lateCount = att.filter((a) => a.late).length;
    summary.todayAttendance = att.find((a) => a.date === today) || null;
    const last = await Payroll.findOne({
      status: "finalized",
      "lines.employeeId": eid,
    })
      .sort({ month: -1 })
      .lean();
    summary.lastPayslip = last
      ? {
          id: last._id,
          month: last.month,
          line: last.lines.find((l) => l.employeeId === eid),
        }
      : null;
  }
  return summary;
}
