import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import app from "../app.js";
import * as models from "../models/index.js";
import { issueToken } from "../middleware/auth.js";
import { cameraPolicy, distanceMeters, verifyCapture, attendanceCaptureSchema } from "../services/camera.js";

const office = { latitude: 24.9, longitude: 67.1, radius: 150 };
const now = new Date("2026-10-25T04:10:00Z");
const capture = (changes = {}) => ({ source: "camera", faceCount: 1, location: { latitude: 24.9, longitude: 67.1, accuracy: 20, capturedAt: now.getTime() }, ...changes });
test("Haversine geofence covers centre, radius boundary, outside and longitude wrap", () => {
  assert.equal(distanceMeters(office, office), 0);
  const edge = { ...office, latitude: office.latitude + 150 / 6371000 * 180 / Math.PI };
  assert.ok(Math.abs(distanceMeters(office, edge) - 150) < 0.000001);
  assert.ok(distanceMeters(office, { ...office, latitude: 25 }) > 10000);
  assert.ok(distanceMeters({ latitude: 0, longitude: 179.999 }, { latitude: 0, longitude: -179.999 }) < 225);
});
test("camera rules reject absent/multiple faces, inaccurate/stale/future GPS and outside radius", () => {
  assert.equal(verifyCapture(capture(), office, now).faceCount, 1);
  assert.equal(verifyCapture(capture({ location: { ...capture().location, accuracy: 100 } }), office, now).accuracyMeters, 100);
  for (const body of [capture({ faceCount: 0 }), capture({ faceCount: 2 }), capture({ location: { ...capture().location, accuracy: 101 } }), capture({ location: { ...capture().location, latitude: 25 } }), capture({ location: { ...capture().location, capturedAt: now.getTime() - 60001 } }), capture({ location: { ...capture().location, capturedAt: now.getTime() + 15001 } })]) {
    assert.throws(() => verifyCapture(body, office, now), (e) => e.status === 422);
  }
  assert.equal(cameraPolicy({ radius: 150 }).enabled, false);
  assert.equal(cameraPolicy({ latitude: 0, longitude: 0, radius: 150 }).enabled, true);
  assert.throws(() => verifyCapture(capture(), { radius: 150 }, now), /configure/);
  assert.throws(() => attendanceCaptureSchema.parse({ ...capture(), photo: "not accepted" }));
  assert.throws(() => attendanceCaptureSchema.parse({ ...capture(), location: { ...capture().location, latitude: "24.9" } }));
  assert.throws(() => attendanceCaptureSchema.parse({ source: "camera" }));
  assert.deepEqual(attendanceCaptureSchema.parse(undefined), { source: "web" });
});
let db, employee, admin, hr, other;
const call = (method, url, token, data) => {
  let req = request(app)[method](`/api${url}`);
  if (token) req = req.set("Authorization", `Bearer ${token}`);
  return data === undefined ? req : req.send(data);
};
before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "camera-test-only-secret-at-least-32-characters";
  delete process.env.AI_API_KEY;
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ args: process.platform === "win32" ? [] : ["--nounixsocket"] }] });
  process.env.MONGODB_URI = db.getUri("camera_test");
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all(Object.values(models).map((m) => m.init()));
  await models.Company.create({ name: "Camera Test", ...office, departments: ["Engineering"], designations: ["Developer"] });
  for (const [key, role] of [["employee", "EMPLOYEE"], ["other", "EMPLOYEE"], ["admin", "ADMIN"], ["hr", "HR"]]) {
    const user = await models.User.create({ name: key, email: `${key}@camera.test`, password: "test-fixture-not-a-login", role, mustChangePassword: false });
    if (role === "EMPLOYEE") {
      const record = await models.Employee.create({ name: key, code: key, email: user.email, userId: user._id, department: "Engineering", designation: "Developer", joiningDate: "2020-01-01", basicCents: 5000000 });
      user.employeeId = record._id; await user.save();
    }
    const token = issueToken(user);
    if (key === "employee") employee = { user, token };
    if (key === "other") other = { user, token };
    if (key === "admin") admin = { user, token };
    if (key === "hr") hr = { user, token };
  }
}, { timeout: 60000 });
after(async () => { await mongoose.disconnect(); await db?.stop(); });
test("camera API requires login and rejects bad captures before any record is saved", async () => {
  assert.equal((await call("get", "/attendance/camera-policy")).status, 401);
  const policy = await call("get", "/attendance/camera-policy", employee.token);
  assert.equal(policy.body.enabled, true); assert.equal(policy.body.storesPhoto, false);
  assert.equal(policy.body.latitude, undefined);
  assert.equal((await call("post", "/attendance/check-in", admin.token, capture())).status, 403);
  for (const value of [capture({ faceCount: 0 }), capture({ faceCount: 2 }), capture({ location: { ...capture().location, capturedAt: Date.now(), accuracy: 101 } }), capture({ location: { ...capture().location, capturedAt: Date.now(), latitude: 25 } }), { source: "camera" }, { source: "web", faceCount: 1 }]) {
    const res = await call("post", "/attendance/check-in", employee.token, value);
    assert.equal(res.status, 422, JSON.stringify(res.body));
  }
  assert.equal(await models.Attendance.countDocuments(), 0);
  const company = (await call("get", "/organization", admin.token)).body;
  assert.equal((await call("put", "/organization", hr.token, company)).status, 403);
  assert.equal((await call("put", "/organization", admin.token, { ...company, latitude: null })).status, 422);
  assert.equal((await call("put", "/organization", admin.token, { ...company, latitude: null, longitude: null })).status, 200);
  assert.equal((await call("get", "/attendance/camera-policy", employee.token)).body.enabled, false);
  assert.equal((await call("post", "/attendance/check-in", employee.token, capture({ location: { ...capture().location, capturedAt: Date.now() } }))).status, 422);
  assert.equal((await call("put", "/organization", admin.token, company)).status, 200);
});
test("camera check-in/out stores results only, duplicate is 409 and employee scope is retained", async () => {
  const body = capture({ location: { ...capture().location, capturedAt: Date.now() } });
  const result = await call("post", "/attendance/check-in", employee.token, body);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.source, "camera");
  assert.equal(result.body.checkInVerification.faceCount, 1);
  assert.equal(result.body.checkInVerification.distanceMeters, 0);
  assert.ok(Math.abs(Date.now() - Date.parse(result.body.checkIn)) < 5000);
  assert.equal((await call("post", "/attendance/check-in", employee.token, body)).status, 409);
  assert.equal((await call("post", "/attendance/check-out", other.token, body)).status, 422);
  const checkout = await call("post", "/attendance/check-out", employee.token, body);
  assert.equal(checkout.status, 200, JSON.stringify(checkout.body));
  assert.equal(checkout.body.checkOutVerification.faceCount, 1);
  const stored = await models.Attendance.findOne().lean();
  assert.equal(stored.location, undefined); assert.equal(stored.photo, undefined);
  assert.equal(stored.checkInVerification.latitude, undefined);
  const date = result.body.date;
  const others = await call("get", `/attendance?start=${date}&end=${date}`, other.token);
  assert.ok(!others.body.some((a) => String(a.employeeId) === String(employee.user.employeeId)));
  const audits = JSON.stringify(await models.Audit.find({ entity: "attendance" }).lean());
  assert.ok(!audits.includes("latitude")); assert.ok(!audits.includes("capturedAt"));
});
test("verified reports work without an AI key, log tools, match dashboard and reject scope escalation", async () => {
  const status = await call("get", "/ai/status", employee.token);
  assert.equal(status.body.configured, false); assert.equal(status.body.AI_API_KEY, undefined);
  const d = await call("get", "/dashboard", admin.token);
  const head = await call("post", "/ai/report", admin.token, { tool: "get_headcount" });
  assert.equal(head.status, 200, JSON.stringify(head.body));
  assert.equal(head.body.data.headcount, d.body.headcount);
  assert.match(head.body.label, /not AI-generated/);
  const own = await call("post", "/ai/report", employee.token, { tool: "get_my_leave_balance" });
  assert.equal(own.status, 200); assert.ok(own.body.data.some((b) => b.type === "sick" && b.remaining === 8));
  assert.equal((await call("post", "/ai/report", employee.token, { tool: "get_headcount" })).status, 403);
  assert.equal((await call("post", "/ai/report", employee.token, { tool: "get_payroll_summary", filters: { department: "Engineering" } })).status, 403);
  assert.equal((await call("post", "/ai/report", employee.token, { tool: "execute_sql" })).status, 422);
  assert.equal((await call("post", "/ai/report", employee.token, {})).status, 422);
  const ownDirectory = await call("post", "/ai/report", employee.token, { tool: "search_employees" });
  assert.equal(ownDirectory.body.data.length, 1); assert.equal(ownDirectory.body.data[0].name, "employee");
  const logs = await models.AILog.find({ kind: "report", outcome: "success" }).lean();
  assert.ok(logs.some((l) => l.tools.includes("get_headcount")));
  await models.RateBucket.updateOne({ _id: `ai:${hr.user._id}:${Math.floor(Date.now() / 3600000)}` }, { $set: { count: 20, expiresAt: new Date(Date.now() + 3600000) } }, { upsert: true });
  assert.equal((await call("post", "/ai/report", hr.token, { tool: "get_headcount" })).status, 429);
});
