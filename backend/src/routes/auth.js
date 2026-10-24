import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { Company, User } from "../models/index.js";
import { transaction } from "../config/db.js";
import { assert } from "../utils/errors.js";
import {
  setupSchema,
  loginSchema,
  password,
  validate,
} from "../validators/index.js";
import { issueToken, publicUser } from "../middleware/auth.js";
import { audit } from "../services/audit.js";
import { ruleSnapshot } from "../services/rules.js";
export const publicAuth = Router(),
  privateAuth = Router();
publicAuth.get("/setup", async (req, res) =>
  res.json({ required: !(await Company.exists({ _id: "company" })) }),
);
publicAuth.post("/setup", validate(setupSchema), async (req, res) => {
  assert(
    !(await Company.exists({ _id: "company" })),
    409,
    "Company setup is already complete.",
  );
  assert(
    process.env.JWT_SECRET?.length >= 32,
    503,
    "Set a JWT_SECRET of at least 32 characters.",
  );
  const result = await transaction(async (session) => {
    const c = (
      await Company.create([{ _id: "company", name: req.body.companyName }], {
        session,
      })
    )[0];
    c.revisions = [{ effectiveDate: "0000-01-01", rules: ruleSnapshot(c) }];
    await c.save({ session });
    const user = (
      await User.create(
        [
          {
            name: req.body.name,
            email: req.body.email,
            password: await bcrypt.hash(req.body.password, 12),
            role: "ADMIN",
            mustChangePassword: false,
          },
        ],
        { session },
      )
    )[0];
    await audit(
      user,
      "setup",
      "company",
      "company",
      null,
      { name: c.name },
      session,
    );
    return user;
  });
  res.status(201).json({ token: issueToken(result), user: publicUser(result) });
});
publicAuth.post("/login", validate(loginSchema), async (req, res) => {
  const u = await User.findOne({ email: req.body.email }).select("+password");
  assert(
    u?.active && (await bcrypt.compare(req.body.password, u.password)),
    401,
    "Email or password is incorrect.",
  );
  res.json({ token: issueToken(u), user: publicUser(u) });
});
privateAuth.get("/me", (req, res) => res.json(publicUser(req.user)));
privateAuth.post("/logout", async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  res.json({ message: "Signed out." });
});
privateAuth.post(
  "/password",
  validate(
    z.object({ currentPassword: z.string().max(128), newPassword: password }),
  ),
  async (req, res) => {
    const u = await User.findById(req.user._id).select("+password");
    assert(
      await bcrypt.compare(req.body.currentPassword, u.password),
      401,
      "Current password is incorrect.",
    );
    assert(
      req.body.currentPassword !== req.body.newPassword,
      422,
      "Choose a different password.",
    );
    await transaction(async (session) => {
      u.password = await bcrypt.hash(req.body.newPassword, 12);
      u.mustChangePassword = false;
      u.tokenVersion++;
      await u.save({ session });
      await audit(u, "password_change", "user", u._id, null, null, session);
    });
    res.json({ token: issueToken(u), user: publicUser(u) });
  },
);
