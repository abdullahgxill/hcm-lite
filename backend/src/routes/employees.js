import { lockLedger } from "../services/locking.js";
import { Router } from "express";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import {
  Attendance,
  Leave,
  Payroll,
  Company,
  Employee,
  User,
} from "../models/index.js";
import { employeeSchema, validate } from "../validators/index.js";
import { roles, ownId } from "../middleware/auth.js";
import { assert } from "../utils/errors.js";
import { transaction } from "../config/db.js";
import { registerEmployee } from "../services/employees.js";
import { audit } from "../services/audit.js";
import { cents } from "../services/rules.js";
export const employees = Router();
const escapeRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const csvCell = (v) =>
  '"' +
  String(v ?? "")
    .replace(/^[=+@\-\t\r]/, "'$&")
    .replaceAll('"', '""') +
  '"';
employees.get("/", async (req, res) => {
  const q = {};
  if (req.user.role === "EMPLOYEE") q._id = ownId(req.user);
  if (req.query.search) {
    assert(String(req.query.search).length <= 100, 422, "Search is too long.");
    q.$or = ["name", "code", "email"].map((k) => ({
      [k]: { $regex: escapeRegex(String(req.query.search)), $options: "i" },
    }));
  }
  for (const k of ["department", "status"])
    if (req.query[k]) q[k] = String(req.query[k]);
  const page = Math.max(1, Number(req.query.page) || 1),
    limit = Math.min(100, Math.max(1, Number(req.query.limit) || 15));
  const [items, total] = await Promise.all([
    Employee.find(q)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Employee.countDocuments(q),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});
employees.get("/export", roles("HR"), async (req, res) => {
  const rows = await Employee.find().lean();
  const keys = [
    "code",
    "name",
    "email",
    "department",
    "designation",
    "joiningDate",
    "basic",
    "status",
    "gender",
    "phone",
    "address",
  ];
  res
    .type("text/csv")
    .attachment("employees.csv")
    .send(
      [
        keys.join(","),
        ...rows.map((e) =>
          keys
            .map((k) => csvCell(k === "basic" ? e.basicCents / 100 : e[k]))
            .join(","),
        ),
      ].join("\n"),
    );
});
employees.post(
  "/import",
  roles("HR"),
  validate(
    z.object({
      csv: z.string().min(1).max(1000000),
      commit: z.boolean().default(false),
    }),
  ),
  async (req, res) => {
    let rows;
    try {
      rows = parse(req.body.csv, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        trim: true,
      });
    } catch {
      assert(
        false,
        422,
        "Malformed CSV. Include a header row and valid quoted fields.",
      );
    }
    assert(rows.length <= 500, 422, "Import at most 500 rows.");
    const company = await Company.findById("company");
    const errors = [],
      valid = [],
      codes = new Set(),
      emails = new Set();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i],
        result = employeeSchema.safeParse(row),
        issues = [];
      if (!result.success)
        issues.push(
          ...result.error.issues.map((e) => ({
            row: i + 2,
            field: e.path.join(".") || "row",
            reason: e.message,
          })),
        );
      if (codes.has(row.code) || (await Employee.exists({ code: row.code })))
        issues.push({
          row: i + 2,
          field: "code",
          reason: "Code must be unique",
        });
      const existing = await User.findOne({ email: row.email?.toLowerCase() });
      if (
        emails.has(row.email?.toLowerCase()) ||
        (existing && !(existing.role === "HR" && !existing.employeeId))
      )
        issues.push({
          row: i + 2,
          field: "email",
          reason: "Email must be unique",
        });
      if (!company.departments.includes(row.department))
        issues.push({
          row: i + 2,
          field: "department",
          reason: "Unknown department",
        });
      if (!company.designations.includes(row.designation))
        issues.push({
          row: i + 2,
          field: "designation",
          reason: "Unknown designation",
        });
      codes.add(row.code);
      emails.add(row.email?.toLowerCase());
      if (issues.length) errors.push(...issues);
      else valid.push({ row: i + 2, data: result.data });
    }
    if (!req.body.commit)
      return res.json({
        dryRun: true,
        total: rows.length,
        valid: valid.length,
        errors,
      });
    const created = await transaction(async (session) => {
      const items = [];
      for (const row of valid)
        items.push({
          row: row.row,
          ...(await registerEmployee(row.data, req.user, session)),
        });
      return items;
    });
    res.status(201).json({ dryRun: false, created, errors });
  },
);
employees.post("/", roles("HR"), validate(employeeSchema), async (req, res) =>
  res
    .status(201)
    .json(
      await transaction((session) =>
        registerEmployee(req.body, req.user, session),
      ),
    ),
);
employees.get("/:id/overview", async (req, res) => {
  assert(
    req.user.role !== "EMPLOYEE" || String(ownId(req.user)) === req.params.id,
    403,
    "You can only view your own profile.",
  );
  const e = await Employee.findById(req.params.id);
  assert(e, 404, "Employee not found.");
  const [attendance, leaves, runs] = await Promise.all([
    Attendance.find({ employeeId: e._id }).sort({ date: -1 }).limit(31).lean(),
    Leave.find({ employeeId: e._id }).sort({ createdAt: -1 }).limit(25).lean(),
    Payroll.find({ status: "finalized", "lines.employeeId": String(e._id) })
      .sort({ month: -1 })
      .limit(12)
      .lean(),
  ]);
  res.json({
    attendance,
    leaves,
    payslips: runs.map((p) => ({
      id: p._id,
      month: p.month,
      line: p.lines.find((l) => l.employeeId === String(e._id)),
    })),
  });
});
employees.get("/:id", async (req, res) => {
  assert(
    req.user.role !== "EMPLOYEE" || String(ownId(req.user)) === req.params.id,
    403,
    "You can only view your own profile.",
  );
  const e = await Employee.findById(req.params.id);
  assert(e, 404, "Employee not found.");
  res.json(e);
});
employees.patch("/:id", async (req, res) => {
  const own = req.user.role === "EMPLOYEE";
  assert(
    own || req.user.role === "HR",
    403,
    "Only HR can edit employee details.",
  );
  assert(
    !own || String(ownId(req.user)) === req.params.id,
    403,
    "You can only edit your own profile.",
  );
  const data = own
    ? z
        .object({ phone: z.string().max(40), address: z.string().max(500) })
        .strict()
        .parse(req.body)
    : employeeSchema.parse(req.body);
  res.json(
    await transaction(async (session) => {
      const e = await Employee.findById(req.params.id).session(session);
      assert(e, 404, "Employee not found.");
      const before = e.toObject();
      if (!own) {
        assert(
          data.email === e.email,
          422,
          "Login email is immutable; deactivate and register a new identity if needed.",
        );
        const c = await lockLedger(session);
        assert(
          c.departments.includes(data.department) &&
            c.designations.includes(data.designation),
          422,
          "Unknown department or designation.",
        );
        e.basicCents = cents(data.basic);
      }
      Object.assign(e, data);
      await e.save({ session });
      await audit(
        req.user,
        "update",
        "employee",
        e._id,
        before,
        e.toObject(),
        session,
      );
      return e;
    }),
  );
});
