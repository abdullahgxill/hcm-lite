import { Router } from "express";
import { z } from "zod";
import { Leave, Company, Employee } from "../models/index.js";
import { validate, leaveSchema } from "../validators/index.js";
import { roles, ownId, scope } from "../middleware/auth.js";
import { transaction } from "../config/db.js";
import { assert } from "../utils/errors.js";
import {
  validateLeave,
  balance,
  assertUnlockedDates,
} from "../services/leaves.js";
import { audit, notify } from "../services/audit.js";
export const leaves = Router();
leaves.get("/options", roles("EMPLOYEE", "HR"), async (req, res) => {
  const c = await Company.findById("company");
  res.json({
    leaveTypes: c.leaveTypes,
    weekends: c.weekends,
    holidays: c.holidays,
    timezone: c.timezone,
  });
});
leaves.get("/balance", roles("EMPLOYEE", "HR"), async (req, res) => {
  const year = z.coerce
    .number()
    .int()
    .min(2000)
    .max(2200)
    .parse(req.query.year || new Date().getFullYear());
  res.json(await balance(ownId(req.user), year));
});
leaves.get("/", async (req, res) =>
  res.json(
    await Leave.find(scope(req.user))
      .populate("employeeId", "name code department")
      .sort({ createdAt: -1 })
      .limit(500),
  ),
);
leaves.post(
  "/",
  roles("EMPLOYEE", "HR"),
  validate(leaveSchema),
  async (req, res) =>
    res.status(201).json(
      await transaction(async (session) => {
        const employeeId = ownId(req.user),
          details = await validateLeave(employeeId, req.body, session);
        const l = (
          await Leave.create([{ ...req.body, ...details, employeeId }], {
            session,
          })
        )[0];
        await audit(
          req.user,
          "apply",
          "leave",
          l._id,
          null,
          l.toObject(),
          session,
        );
        return l;
      }),
    ),
);
leaves.post("/:id/cancel", roles("EMPLOYEE", "HR"), async (req, res) =>
  res.json(
    await transaction(async (session) => {
      const l = await Leave.findById(req.params.id).session(session);
      assert(l, 404, "Leave not found.");
      assert(
        String(l.employeeId) === String(ownId(req.user)),
        403,
        "You can only cancel your own leave.",
      );
      assert(
        ["pending", "approved"].includes(l.status),
        409,
        "This request cannot be cancelled.",
      );
      await assertUnlockedDates(l.days, session);
      await Employee.updateOne(
        { _id: l.employeeId },
        { $inc: { quotaVersion: 1 } },
        { session },
      );
      const before = l.toObject();
      l.status = "cancelled";
      await l.save({ session });
      await audit(
        req.user,
        "cancel",
        "leave",
        l._id,
        before,
        l.toObject(),
        session,
      );
      return l;
    }),
  ),
);
leaves.post(
  "/:id/decision",
  roles("HR"),
  validate(
    z.object({
      approved: z.boolean(),
      comment: z.string().trim().min(2).max(1000),
    }),
  ),
  async (req, res) =>
    res.json(
      await transaction(async (session) => {
        const l = await Leave.findById(req.params.id).session(session);
        assert(l, 404, "Leave not found.");
        assert(
          l.status === "pending",
          409,
          "This leave has already been decided.",
        );
        assert(
          String(l.employeeId) !== String(req.user.employeeId),
          403,
          "You cannot approve your own leave.",
        );
        if (req.body.approved)
          await validateLeave(l.employeeId, l.toObject(), session, l._id);
        l.status = req.body.approved ? "approved" : "rejected";
        l.comment = req.body.comment;
        l.decidedBy = req.user._id;
        await l.save({ session });
        const e = await Employee.findById(l.employeeId).session(session);
        await notify(
          e.userId,
          `Leave ${l.status}`,
          `${l.start} to ${l.end}: ${l.comment}`,
          session,
        );
        await audit(
          req.user,
          l.status,
          "leave",
          l._id,
          { status: "pending" },
          l.toObject(),
          session,
        );
        return l;
      }),
    ),
);
