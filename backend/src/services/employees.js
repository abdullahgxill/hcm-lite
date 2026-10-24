import { lockLedger } from "./locking.js";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { Employee, User, Company } from "../models/index.js";
import { assert } from "../utils/errors.js";
import { cents } from "./rules.js";
import { audit } from "./audit.js";
export async function registerEmployee(
  data,
  actor,
  session,
  role = "EMPLOYEE",
) {
  const company = await lockLedger(session);
  assert(
    company.departments.includes(data.department),
    422,
    "Unknown department.",
  );
  assert(
    company.designations.includes(data.designation),
    422,
    "Unknown designation.",
  );
  const existing = await User.findOne({ email: data.email }).session(session);
  assert(
    !existing ||
      (existing.role === "HR" && !existing.employeeId && role === "EMPLOYEE"),
    422,
    "Email already has a login.",
  );
  const temporaryPassword = `Hcm!${crypto.randomBytes(12).toString("base64url")}7`;
  const user =
    existing ||
    (
      await User.create(
        [
          {
            name: data.name,
            email: data.email,
            password: await bcrypt.hash(temporaryPassword, 12),
            role,
          },
        ],
        { session },
      )
    )[0];
  const employee = (
    await Employee.create(
      [{ ...data, basicCents: cents(data.basic), userId: user._id }],
      { session },
    )
  )[0];
  user.employeeId = employee._id;
  await user.save({ session });
  await audit(
    actor,
    "create",
    "employee",
    employee._id,
    null,
    employee.toObject(),
    session,
  );
  return {
    employee,
    temporaryPassword: existing ? undefined : temporaryPassword,
  };
}
