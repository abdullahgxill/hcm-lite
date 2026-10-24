import { Router } from "express";
import { z } from "zod";
import {
  Attendance,
  Company,
  Employee,
  Correction,
  Leave,
} from "../models/index.js";
import { roles, ownId, scope } from "../middleware/auth.js";
import { validate, isoDate } from "../validators/index.js";
import { assert } from "../utils/errors.js";
import { transaction } from "../config/db.js";
import {
  localDate,
  ruleSnapshot,
  attendanceStatus,
  workingDays,
  dateRange,
  rulesOn,
} from "../services/rules.js";
import { assertUnlockedDates } from "../services/leaves.js";
import { audit, notify } from "../services/audit.js";
export const attendance = Router();
attendance.get("/", async (req, res) => {
  const c = await Company.findById("company"),
    today = localDate(new Date(), c.timezone),
    start = isoDate.parse(req.query.start || `${today.slice(0, 7)}-01`),
    end = isoDate.parse(req.query.end || today);
  dateRange(start, end);
  const employees = await Employee.find({
    ...(req.user.role === "EMPLOYEE" ? { _id: ownId(req.user) } : {}),
    ...(req.query.department
      ? { department: String(req.query.department) }
      : {}),
  }).lean();
  const ids = employees.map((e) => e._id);
  const records = await Attendance.find({
    employeeId: { $in: ids },
    date: { $gte: start, $lte: end },
  }).lean();
  const leaves = await Leave.find({
    employeeId: { $in: ids },
    status: "approved",
    start: { $lte: end },
    end: { $gte: start },
  }).lean();
  const items = [];
  for (const d of dateRange(start, end).filter((d) => d <= today))
    for (const e of employees) {
      if (
        d < e.joiningDate ||
        (e.leavingDate && d > e.leavingDate) ||
        (e.status === "inactive" && !e.leavingDate)
      )
        continue;
      const a = records.find(
        (r) => String(r.employeeId) === String(e._id) && r.date === d,
      );
      const l = leaves.find(
        (l) => String(l.employeeId) === String(e._id) && l.days.includes(d),
      );
      const working = workingDays(d, d, rulesOn(c, d)).length;
      if (!a && !l && !working) continue;
      items.push(
        a
          ? {
              ...a,
              name: e.name,
              department: e.department,
              status:
                !a.checkOut && d < today
                  ? "missing_checkout"
                  : !a.checkOut
                    ? a.late
                      ? "late"
                      : "present"
                    : a.status,
            }
          : {
              employeeId: e._id,
              name: e.name,
              department: e.department,
              date: d,
              status: l ? "on_leave" : "absent",
              hours: 0,
            },
      );
    }
  res.json(items.sort((a, b) => b.date.localeCompare(a.date)));
});
attendance.post("/check-in", roles("EMPLOYEE", "HR"), async (req, res) => {
  const employeeId = ownId(req.user),
    now = new Date(),
    c = await Company.findById("company"),
    date = localDate(now, c.timezone);
  const result = await transaction(async (session) => {
    await assertUnlockedDates([date], session);
    const e = await Employee.findByIdAndUpdate(
      employeeId,
      { $inc: { quotaVersion: 1 } },
      { session, new: true },
    );
    assert(
      e &&
        ["active", "probation"].includes(e.status) &&
        e.joiningDate <= date &&
        (!e.leavingDate || date <= e.leavingDate),
      422,
      "Your employment is not active today.",
    );
    assert(
      !(await Attendance.exists({ employeeId, date }).session(session)),
      409,
      "You have already checked in today.",
    );
    assert(
      !(await Leave.exists({
        employeeId,
        status: "approved",
        days: date,
      }).session(session)),
      422,
      "You have approved leave today.",
    );
    const rules = ruleSnapshot(c);
    const a = (
      await Attendance.create(
        [
          {
            employeeId,
            date,
            checkIn: now,
            rules,
            ...attendanceStatus(now, null, rules),
          },
        ],
        { session },
      )
    )[0];
    await audit(
      req.user,
      "check_in",
      "attendance",
      a._id,
      null,
      { date, checkIn: now },
      session,
    );
    return a;
  });
  res.status(201).json(result);
});
attendance.post("/check-out", roles("EMPLOYEE", "HR"), async (req, res) => {
  const c = await Company.findById("company"),
    date = localDate(new Date(), c.timezone);
  res.json(
    await transaction(async (session) => {
      await assertUnlockedDates([date], session);
      const a = await Attendance.findOne({
        employeeId: ownId(req.user),
        date,
      }).session(session);
      assert(a, 422, "Check in before checking out.");
      assert(!a.checkOut, 409, "You have already checked out.");
      a.checkOut = new Date();
      Object.assign(a, attendanceStatus(a.checkIn, a.checkOut, a.rules));
      await a.save({ session });
      await audit(
        req.user,
        "check_out",
        "attendance",
        a._id,
        null,
        { date, status: a.status },
        session,
      );
      return a;
    }),
  );
});
attendance.get("/corrections", async (req, res) =>
  res.json(
    await Correction.find(scope(req.user))
      .populate("employeeId", "name code department")
      .sort({ createdAt: -1 })
      .limit(500),
  ),
);
attendance.post(
  "/corrections",
  roles("EMPLOYEE"),
  validate(
    z.object({
      date: isoDate,
      checkIn: z.string().datetime({ offset: true }),
      checkOut: z.string().datetime({ offset: true }),
      reason: z.string().trim().min(3).max(1000),
    }),
  ),
  async (req, res) => {
    const c = await Company.findById("company");
    assert(
      req.body.date <= localDate(new Date(), c.timezone),
      422,
      "You cannot correct a future date.",
    );
    assert(
      new Date(req.body.checkOut) > new Date(req.body.checkIn) &&
        new Date(req.body.checkOut) <= new Date() &&
        localDate(new Date(req.body.checkIn), c.timezone) === req.body.date &&
        localDate(new Date(req.body.checkOut), c.timezone) === req.body.date,
      422,
      "Times must be on the selected day, ordered and in the past.",
    );
    const e = await Employee.findById(ownId(req.user));
    assert(
      req.body.date >= e.joiningDate &&
        (!e.leavingDate || req.body.date <= e.leavingDate),
      422,
      "Date is outside employment.",
    );
    const item = await transaction(async (session) => {
      await assertUnlockedDates([req.body.date], session);
      assert(
        !(await Correction.exists({
          employeeId: ownId(req.user),
          date: req.body.date,
          status: "pending",
        }).session(session)),
        409,
        "A correction is already pending for this day.",
      );
      const a = (
        await Correction.create(
          [{ ...req.body, employeeId: ownId(req.user) }],
          { session },
        )
      )[0];
      await audit(
        req.user,
        "request",
        "correction",
        a._id,
        null,
        a.toObject(),
        session,
      );
      return a;
    });
    res.status(201).json(item);
  },
);
attendance.post(
  "/corrections/:id/decision",
  roles("HR"),
  validate(
    z.object({
      approved: z.boolean(),
      comment: z.string().trim().min(2).max(1000),
    }),
  ),
  async (req, res) => {
    res.json(
      await transaction(async (session) => {
        const r = await Correction.findById(req.params.id).session(session);
        assert(r, 404, "Correction not found.");
        assert(
          r.status === "pending",
          409,
          "This correction has already been decided.",
        );
        assert(
          String(r.employeeId) !== String(req.user.employeeId),
          403,
          "You cannot approve your own correction.",
        );
        await assertUnlockedDates([r.date], session);
        r.status = req.body.approved ? "approved" : "rejected";
        r.comment = req.body.comment;
        r.decidedBy = req.user._id;
        if (req.body.approved) {
          assert(
            !(await Leave.exists({
              employeeId: r.employeeId,
              status: "approved",
              days: r.date,
            }).session(session)),
            422,
            "Cannot correct attendance on approved leave.",
          );
          const c = await Company.findById("company").session(session),
            existing = await Attendance.findOne({
              employeeId: r.employeeId,
              date: r.date,
            }).session(session),
            rules = existing?.rules || rulesOn(c, r.date);
          await Attendance.findOneAndUpdate(
            { employeeId: r.employeeId, date: r.date },
            {
              $set: {
                checkIn: r.checkIn,
                checkOut: r.checkOut,
                rules,
                ...attendanceStatus(r.checkIn, r.checkOut, rules),
                source: "correction",
              },
            },
            { upsert: true, session },
          );
        }
        await r.save({ session });
        const e = await Employee.findById(r.employeeId).session(session);
        await notify(
          e.userId,
          `Attendance correction ${r.status}`,
          r.comment,
          session,
        );
        await audit(
          req.user,
          r.status,
          "correction",
          r._id,
          { status: "pending" },
          r.toObject(),
          session,
        );
        return r;
      }),
    );
  },
);
