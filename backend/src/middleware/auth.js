import jwt from "jsonwebtoken";
import { User } from "../models/index.js";
import { assert } from "../utils/errors.js";
export function issueToken(user) {
  assert(
    process.env.JWT_SECRET?.length >= 32,
    503,
    "JWT_SECRET must contain at least 32 characters.",
  );
  return jwt.sign(
    { sub: String(user._id), version: user.tokenVersion },
    process.env.JWT_SECRET,
    {
      expiresIn: "8h",
      issuer: "hcm-lite",
      audience: "hcm-web",
      algorithm: "HS256",
    },
  );
}
export async function authenticate(req, res, next) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  assert(token, 401, "Sign in to continue.");
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "hcm-lite",
      audience: "hcm-web",
      algorithms: ["HS256"],
    });
  } catch {
    assert(false, 401, "Your session has expired. Sign in again.");
  }
  const user = await User.findById(payload.sub);
  assert(
    user?.active && user.tokenVersion === payload.version,
    401,
    "This session is no longer active.",
  );
  req.user = user;
  if (
    user.mustChangePassword &&
    !["/auth/me", "/auth/password", "/auth/logout"].includes(req.path)
  )
    assert(false, 403, "Change your temporary password before continuing.");
  next();
}
export const roles =
  (...allowed) =>
  (req, res, next) => {
    assert(
      allowed.includes(req.user.role),
      403,
      "Your role cannot perform this action.",
    );
    next();
  };
export function ownId(user) {
  assert(
    user.employeeId,
    422,
    "Your login needs an employee profile for self-service. Ask HR to register it.",
  );
  return user.employeeId;
}
export const scope = (user) =>
  user.role === "EMPLOYEE" ? { employeeId: ownId(user) } : {};
export const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  employeeId: user.employeeId,
  mustChangePassword: user.mustChangePassword,
});
