import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { Company, User, Employee } from "../models/index.js";
import { roles, publicUser } from "../middleware/auth.js";
import { settingsSchema, validate, password } from "../validators/index.js";
import { ruleSnapshot, localDate } from "../services/rules.js";
import { audit } from "../services/audit.js";
import { transaction } from "../config/db.js";
import { assert } from "../utils/errors.js";
export const organization = Router();
organization.get("/", roles("ADMIN", "HR"), async (req, res) =>
  res.json(await Company.findById("company")),
);
organization.put(
  "/",
  roles("ADMIN"),
  validate(settingsSchema),
  async (req, res) => {
    const c = await transaction(async (session) => {
      const c = await Company.findById("company").session(session),
        before = c.toObject();
      const departments = new Set(req.body.departments),
        designations = new Set(req.body.designations);
      assert(
        !(await Employee.exists({
          $or: [
            { department: { $nin: [...departments] } },
            { designation: { $nin: [...designations] } },
          ],
        }).session(session)),
        422,
        "Departments and designations in use cannot be removed.",
      );
      Object.assign(c, req.body);
      c.revisions.push({
        effectiveDate: localDate(new Date(), c.timezone),
        rules: ruleSnapshot(c),
      });
      await c.save({ session });
      await audit(
        req.user,
        "update",
        "company",
        c._id,
        before,
        c.toObject(),
        session,
      );
      return c;
    });
    res.json(c);
  },
);
organization.get("/users", roles("ADMIN"), async (req, res) =>
  res.json(
    (await User.find().sort({ createdAt: -1 })).map((u) => ({
      ...publicUser(u),
      active: u.active,
    })),
  ),
);
organization.post(
  "/users",
  roles("ADMIN"),
  validate(
    z.object({
      name: z.string().trim().min(2).max(150),
      email: z
        .string()
        .trim()
        .email()
        .transform((v) => v.toLowerCase()),
      temporaryPassword: password.optional(),
    }),
  ),
  async (req, res) => {
    const temporaryPassword = req.body.temporaryPassword || `Hcm!${crypto.randomBytes(12).toString("base64url")}7`;
    const u = await transaction(async (session) => {
      const u = (
        await User.create(
          [
            {
              name: req.body.name,
              email: req.body.email,
              password: await bcrypt.hash(temporaryPassword, 12),
              role: "HR",
            },
          ],
          { session },
        )
      )[0];
      await audit(
        req.user,
        "create",
        "user",
        u._id,
        null,
        publicUser(u),
        session,
      );
      return u;
    });
    res.status(201).json({ user: publicUser(u), temporaryPassword });
  },
);
organization.patch(
  "/users/:id",
  roles("ADMIN"),
  validate(
    z.object({ active: z.boolean().optional(), reset: z.boolean().optional(), temporaryPassword: password.optional() })
      .refine((v) => !v.temporaryPassword || v.reset === true, { message: "A temporary password requires a password reset." }),
  ),
  async (req, res) => {
    assert(
      String(req.user._id) !== req.params.id,
      422,
      "You cannot deactivate or reset your own login here.",
    );
    let temporaryPassword;
    const u = await transaction(async (session) => {
      const u = await User.findById(req.params.id).session(session);
      assert(u, 404, "User not found.");
      assert(u.role !== "ADMIN", 403, "Admin accounts are protected.");
      if (req.body.active !== undefined) u.active = req.body.active;
      if (req.body.reset) {
        temporaryPassword = req.body.temporaryPassword || `Hcm!${crypto.randomBytes(12).toString("base64url")}7`;
        u.password = await bcrypt.hash(temporaryPassword, 12);
        u.mustChangePassword = true;
      }
      u.tokenVersion++;
      await u.save({ session });
      await audit(
        req.user,
        req.body.reset ? "reset_login" : "login_status",
        "user",
        u._id,
        null,
        { active: u.active },
        session,
      );
      return u;
    });
    res.json({ user: publicUser(u), temporaryPassword });
  },
);
