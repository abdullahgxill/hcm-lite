import { lockLedger } from "../services/locking.js";
import { Router } from "express";
import { z } from "zod";
import PDFDocument from "pdfkit";
import {
  Payroll,
  Employee,
  Attendance,
  Leave,
  Company,
  User,
} from "../models/index.js";
import { roles, ownId } from "../middleware/auth.js";
import { validate } from "../validators/index.js";
import { assert } from "../utils/errors.js";
import { transaction } from "../config/db.js";
import { payrollLine, ruleSnapshot } from "../services/rules.js";
import { audit, notify } from "../services/audit.js";
export const payroll = Router();
payroll.get("/", async (req, res) => {
  const self = req.user.role === "EMPLOYEE";
  const runs = await Payroll.find(
    self
      ? { status: "finalized", "lines.employeeId": String(ownId(req.user)) }
      : {},
  )
    .sort({ month: -1 })
    .lean();
  res.json(
    runs.map((p) =>
      self
        ? {
            ...p,
            lines: p.lines.filter(
              (l) => l.employeeId === String(ownId(req.user)),
            ),
          }
        : p,
    ),
  );
});
payroll.post(
  "/",
  roles("HR"),
  validate(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })),
  async (req, res) => {
    res.status(201).json(
      await transaction(async (session) => {
        const month = req.body.month,
          existing = await Payroll.findOne({ month }).session(session);
        assert(
          existing?.status !== "finalized",
          409,
          "Finalized payroll is locked.",
        );
        const c = await lockLedger(session),
          employees = await Employee.find({
            joiningDate: { $lte: `${month}-31` },
            $or: [
              { leavingDate: { $gte: `${month}-01` } },
              { leavingDate: null },
              { leavingDate: { $exists: false } },
            ],
          }).session(session);
        const eligible = employees.filter(
          (e) => e.status !== "inactive" || e.leavingDate,
        );
        const lines = [];
        for (const e of eligible) {
          const att = await Attendance.find({
            employeeId: e._id,
            date: { $gte: `${month}-01`, $lte: `${month}-31` },
          }).session(session);
          const ls = await Leave.find({
            employeeId: e._id,
            status: "approved",
            start: { $lte: `${month}-31` },
            end: { $gte: `${month}-01` },
          }).session(session);
          lines.push(payrollLine(e, month, c, att, ls));
        }
        assert(
          lines.length,
          422,
          "Register at least one employee for this payroll month.",
        );
        const p = existing || new Payroll({ month });
        p.lines = lines;
        p.sourceVersion = c.ledgerVersion;
        p.rules = ruleSnapshot(c);
        if (existing) p.revision++;
        await p.save({ session });
        await audit(
          req.user,
          "draft",
          "payroll",
          p._id,
          existing ? { revision: p.revision - 1 } : null,
          { month, revision: p.revision, employees: lines.length },
          session,
        );
        return p;
      }),
    );
  },
);
payroll.post(
  "/:id/finalize",
  roles("ADMIN"),
  validate(z.object({ revision: z.number().int().positive() })),
  async (req, res) =>
    res.json(
      await transaction(async (session) => {
        const c = await lockLedger(session);
        const p = await Payroll.findOneAndUpdate(
          {
            _id: req.params.id,
            status: "draft",
            revision: req.body.revision,
            sourceVersion: c.ledgerVersion - 1,
          },
          {
            $set: {
              status: "finalized",
              finalizedAt: new Date(),
              finalizedBy: req.user._id,
            },
          },
          { session, new: true },
        );
        assert(
          p,
          409,
          "Payroll is locked or its source data has changed. Ask HR to recalculate, then review the latest draft.",
        );
        for (const l of p.lines) {
          const e = await Employee.findById(l.employeeId).session(session);
          if (e)
            await notify(
              e.userId,
              "Your payslip is ready",
              `The payslip for ${p.month} is available to download.`,
              session,
            );
        }
        await audit(
          req.user,
          "finalize",
          "payroll",
          p._id,
          { status: "draft" },
          { status: "finalized", month: p.month },
          session,
        );
        return p;
      }),
    ),
);
payroll.get("/:id/payslip/:employeeId", async (req, res) => {
  assert(
    req.user.role !== "EMPLOYEE" ||
      String(ownId(req.user)) === req.params.employeeId,
    403,
    "You can only download your own payslip.",
  );
  const p = await Payroll.findById(req.params.id).lean();
  assert(p, 404, "Payroll not found.");
  assert(
    p.status === "finalized",
    409,
    "Payslips are available after Admin finalization.",
  );
  const l = p.lines.find((l) => l.employeeId === req.params.employeeId);
  assert(l, 404, "Payslip not found.");
  const c = await Company.findById("company");
  const doc = new PDFDocument({
    size: "A4",
    margin: 55,
    info: { Title: `Payslip ${p.month}` },
  });
  res
    .type("application/pdf")
    .attachment(
      `payslip-${l.code.replace(/[^a-zA-Z0-9_-]/g, "")}-${p.month}.pdf`,
    );
  doc.pipe(res);
  doc.fillColor("#142c3b").fontSize(26).text(c.name);
  doc.fontSize(11).fillColor("#58717b").text("CONFIDENTIAL / MONTHLY PAYSLIP");
  doc.moveDown(2).fontSize(18).fillColor("#142c3b").text(l.name);
  doc.fontSize(11).text(`${l.code}  |  ${l.department}  |  ${p.month}`);
  doc.moveDown(2);
  const rows = [
    ["Basic salary", l.basicCents],
    ["House rent allowance (40%)", l.hraCents],
    ["Medical allowance (10%)", l.medicalCents],
    ["Contract gross", l.grossCents],
    ["Prorated gross", l.proratedGrossCents],
    ["Attendance / unpaid deductions", -l.deductionCents],
    ["Illustrative income tax", -l.taxCents],
    ["NET PAY", l.netCents],
  ];
  for (const [label, v] of rows) {
    const y = doc.y;
    doc.fillColor("#142c3b").fontSize(12).text(label, 55, y, { width: 330 });
    doc.text(
      `PKR ${(v / 100).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      385,
      y,
      { width: 150, align: "right" },
    );
    doc.moveDown(0.9);
  }
  doc
    .moveDown()
    .fontSize(10)
    .fillColor("#58717b")
    .text(
      `Working days: ${l.workingDays} | Eligible: ${l.eligibleDays}\nAbsent: ${l.absent} | Unpaid: ${l.unpaid} | Half days: ${l.halfDays}\nFinalized: ${p.finalizedAt.toISOString()}\nIllustrative challenge tax slabs; not a statutory tax statement.`,
    );
  doc.end();
});
