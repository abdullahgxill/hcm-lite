import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import app from "../app.js";
import * as models from "../models/index.js";
import { executeTool, runAI } from "../services/ai.js";
import { localDate } from "../services/rules.js";
let db, admin, hr, emp, second, employee, other, dir;
const strong = "SecurePass123!";
const api = (method, url, token, body) => {
  const r = request(app)[method](`/api${url}`);
  if (token) r.set("Authorization", `Bearer ${token}`);
  return body ? r.send(body) : r;
};
const ok = (res, status = 200) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body;
};
before(
  async () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET =
      "test-only-random-secret-with-at-least-32-characters";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    dir = await fs.mkdtemp(path.join(process.cwd(), "hcm-test-"));
    db = await MongoMemoryReplSet.create({
      instanceOpts: [
        {
          dbPath: dir,
          args: process.platform === "win32" ? [] : ["--nounixsocket"],
        },
      ],
      replSet: { count: 1 },
    });
    process.env.MONGODB_URI = db.getUri("hcm_test");
    await mongoose.connect(process.env.MONGODB_URI);
    await Promise.all(Object.values(models).map((m) => m.init()));
  },
  { timeout: 60000 },
);
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});
test("fresh install, authentication, roles and employee creation", async () => {
  assert.equal(ok(await api("get", "/auth/setup")).required, true);
  const result = ok(
    await api("post", "/auth/setup", null, {
      companyName: "Test Company",
      name: "Admin",
      email: "admin@example.test",
      password: strong,
    }),
    201,
  );
  admin = result.token;
  assert.equal(await models.Employee.countDocuments(), 0);
  ok(
    await api("post", "/auth/setup", null, {
      companyName: "Again",
      name: "Again",
      email: "again@example.test",
      password: strong,
    }),
    409,
  );
  ok(
    await api("post", "/auth/login", null, {
      email: "admin@example.test",
      password: "Wrongpass123",
    }),
    401,
  );
  ok(await api("get", "/employees"), 401);
  let company = ok(await api("get", "/organization", admin));
  company.departments = ["Engineering", "Operations"];
  company.designations = ["Developer", "Manager"];
  company.weekends = [];
  company.holidays = [];
  ok(await api("put", "/organization", admin, company));
  const account = ok(
    await api("post", "/organization/users", admin, {
      name: "HR Manager",
      email: "hr@example.test",
    }),
    201,
  );
  let login = ok(
    await api("post", "/auth/login", null, {
      email: "hr@example.test",
      password: account.temporaryPassword,
    }),
  );
  ok(await api("get", "/employees", login.token), 403);
  hr = ok(
    await api("post", "/auth/password", login.token, {
      currentPassword: account.temporaryPassword,
      newPassword: strong,
    }),
  ).token;
  ok(await api("put", "/organization", hr, company), 403);
  ok(await api("get", "/audit", hr), 403);
  const data = {
    name: "First Employee",
    code: "E001",
    email: "first@example.test",
    department: "Engineering",
    designation: "Developer",
    joiningDate: "2026-01-01",
    basic: 100000,
  };
  ok(await api("post", "/employees", admin, data), 403);
  const registered = ok(await api("post", "/employees", hr, data), 201);
  employee = registered.employee;
  login = ok(
    await api("post", "/auth/login", null, {
      email: data.email,
      password: registered.temporaryPassword,
    }),
  );
  emp = ok(
    await api("post", "/auth/password", login.token, {
      currentPassword: registered.temporaryPassword,
      newPassword: strong,
    }),
  ).token;
  const reg2 = ok(
    await api("post", "/employees", hr, {
      ...data,
      name: "Second Employee",
      code: "E002",
      email: "second@example.test",
      department: "Operations",
    }),
    201,
  );
  other = reg2.employee;
  login = ok(
    await api("post", "/auth/login", null, {
      email: other.email,
      password: reg2.temporaryPassword,
    }),
  );
  second = ok(
    await api("post", "/auth/password", login.token, {
      currentPassword: reg2.temporaryPassword,
      newPassword: strong,
    }),
  ).token;
  assert.equal(ok(await api("get", "/employees", emp)).total, 1);
  ok(await api("get", `/employees/${other._id}`, emp), 403);
  ok(
    await api("patch", `/employees/${employee._id}`, emp, {
      phone: "1",
      address: "Office",
      basic: 1,
    }),
    422,
  );
  ok(await api("get", "/organization", emp), 403);
});
test("attendance server stamp, duplicate 409, checkout and role guards", async () => {
  ok(await api("post", "/attendance/check-in", admin), 403);
  const before = Date.now(),
    a = ok(
      await api("post", "/attendance/check-in", emp, { checkIn: "2020-01-01" }),
      201,
    );
  assert.ok(new Date(a.checkIn).getTime() >= before);
  ok(await api("post", "/attendance/check-in", emp), 409);
  ok(await api("post", "/attendance/check-out", second), 422);
  const out = ok(await api("post", "/attendance/check-out", emp));
  assert.equal(out.status, "half_day");
  ok(await api("post", "/attendance/check-out", emp), 409);
  const rows = ok(await api("get", "/attendance", emp));
  assert.ok(rows.every((r) => String(r.employeeId) === employee._id));
});
test("leave overlap, quotas, comments, cancellation and decision notification", async () => {
  const payload = {
    type: "casual",
    start: "2026-10-26",
    end: "2026-10-27",
    reason: "Family wedding",
  };
  const leave = ok(await api("post", "/leaves", emp, payload), 201);
  ok(await api("post", "/leaves", emp, payload), 422);
  ok(
    await api("post", "/leaves", emp, {
      ...payload,
      start: "2026-11-01",
      end: "2026-11-20",
    }),
    422,
  );
  ok(
    await api("post", `/leaves/${leave._id}/decision`, admin, {
      approved: true,
      comment: "Approved",
    }),
    403,
  );
  ok(
    await api("post", `/leaves/${leave._id}/decision`, hr, {
      approved: true,
      comment: "Approved",
    }),
  );
  assert.equal(
    ok(await api("get", "/leaves/balance", emp)).find(
      (b) => b.type === "casual",
    ).remaining,
    8,
  );
  assert.ok(
    ok(await api("get", "/notifications", emp)).some(
      (n) => n.title === "Leave approved",
    ),
  );
  ok(await api("post", `/leaves/${leave._id}/cancel`, second), 403);
  ok(await api("post", `/leaves/${leave._id}/cancel`, emp));
  assert.equal(
    ok(await api("get", "/leaves/balance", emp)).find(
      (b) => b.type === "casual",
    ).remaining,
    10,
  );
});
test("concurrent approvals cannot overspend the same annual quota", async () => {
  const a = ok(
    await api("post", "/leaves", emp, {
      type: "annual",
      start: "2026-11-02",
      end: "2026-11-09",
      reason: "Annual holiday",
    }),
    201,
  );
  const b = ok(
    await api("post", "/leaves", emp, {
      type: "annual",
      start: "2026-11-16",
      end: "2026-11-23",
      reason: "Annual holiday",
    }),
    201,
  );
  const results = await Promise.all(
    [a, b].map((l) =>
      api("post", `/leaves/${l._id}/decision`, hr, {
        approved: true,
        comment: "Review approved",
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 422]);
  assert.equal(
    ok(await api("get", "/leaves/balance", emp)).find(
      (b) => b.type === "annual",
    ).remaining,
    6,
  );
  for (const l of [a, b]) ok(await api("post", `/leaves/${l._id}/cancel`, emp));
});
test("CSV validation is side-effect free and commit creates only validated rows", async () => {
  const csv =
    "code,name,email,department,designation,joiningDate,basic\nE003,Third Person,third@example.test,Engineering,Developer,2026-01-01,80000\nE004,Bad Person,invalid,Unknown,Developer,not-a-date,0";
  const dry = ok(
    await api("post", "/employees/import", hr, { csv, commit: false }),
  );
  assert.equal(dry.valid, 1);
  assert.ok(dry.errors.some((e) => e.row === 3 && e.field === "email"));
  assert.equal(await models.Employee.countDocuments(), 2);
  const committed = ok(
    await api("post", "/employees/import", hr, { csv, commit: true }),
    201,
  );
  assert.equal(committed.created.length, 1);
  ok(await api("get", "/employees/export", emp), 403);
  assert.ok(
    (await api("get", "/employees/export", hr)).text.includes("Third Person"),
  );
});
test("dashboard and AI use identical live metrics and employee scope", async () => {
  const dashboard = ok(await api("get", "/dashboard", hr));
  assert.equal(dashboard.headcount, 3);
  assert.equal(dashboard.presentToday, 1);
  const u = await models.User.findOne({ email: "hr@example.test" }),
    tool = await executeTool(u, "get_headcount", {});
  assert.equal(tool.headcount, dashboard.headcount);
  const scoped = ok(await api("get", "/dashboard?department=Engineering", hr));
  assert.equal(scoped.headcount, 2);
  const self = await models.User.findOne({ email: employee.email });
  await assert.rejects(() => executeTool(self, "get_headcount", {}), {
    status: 403,
  });
  await assert.rejects(() =>
    executeTool(self, "get_payroll_summary", { employeeId: other._id }),
  );
  await assert.rejects(
    () =>
      executeTool(self, "get_attendance_summary", { department: "Operations" }),
    { status: 403 },
  );
  const names = await executeTool(self, "search_employees", {});
  assert.equal(names.length, 1);
  assert.equal(String(names[0]._id), employee._id);
});
test("correction request approval and immutable audit API", async () => {
  const c = ok(
    await api("post", "/attendance/corrections", emp, {
      date: "2026-10-23",
      checkIn: "2026-10-23T04:00:00Z",
      checkOut: "2026-10-23T12:00:00Z",
      reason: "Check-in connection failed",
    }),
    201,
  );
  ok(
    await api("post", `/attendance/corrections/${c._id}/decision`, hr, {
      approved: true,
      comment: "Confirmed by manager",
    }),
  );
  const records = ok(
    await api("get", "/attendance?start=2026-10-23&end=2026-10-23", emp),
  );
  assert.equal(records[0].status, "present");
  const logs = ok(await api("get", "/audit", admin));
  assert.ok(logs.items.some((l) => l.entity === "correction"));
  ok(await api("delete", `/audit/${logs.items[0]._id}`, admin), 404);
});
test("payroll draft, review revision, finalization lock, payslip PDF and data scope", async () => {
  let p = ok(await api("post", "/payroll", hr, { month: "2026-10" }), 201);
  await api("patch", `/employees/${employee._id}`, hr, {
    ...employee,
    basic: 100000,
  });
  ok(
    await api("post", `/payroll/${p._id}/finalize`, admin, {
      revision: p.revision,
    }),
    409,
  );
  p = ok(await api("post", "/payroll", hr, { month: "2026-10" }), 201);
  assert.equal(p.lines.length, 3);
  const l = p.lines.find((l) => l.employeeId === employee._id);
  assert.equal(l.grossCents, 15000000);
  assert.equal(l.taxCents, 1000000);
  ok(
    await api("post", `/payroll/${p._id}/finalize`, hr, {
      revision: p.revision,
    }),
    403,
  );
  ok(
    await api("post", `/payroll/${p._id}/finalize`, admin, {
      revision: p.revision + 1,
    }),
    409,
  );
  const final = ok(
    await api("post", `/payroll/${p._id}/finalize`, admin, {
      revision: p.revision,
    }),
  );
  assert.equal(final.status, "finalized");
  ok(await api("post", "/payroll", hr, { month: "2026-10" }), 409);
  ok(
    await api("post", `/payroll/${p._id}/finalize`, admin, {
      revision: p.revision,
    }),
    409,
  );
  ok(await api("post", "/attendance/check-in", second), 409);
  const personal = ok(await api("get", "/payroll", emp));
  assert.equal(personal[0].lines.length, 1);
  const pdf = await api(
    "get",
    `/payroll/${p._id}/payslip/${employee._id}`,
    emp,
  );
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers["content-type"], "application/pdf");
  assert.ok(
    Buffer.isBuffer(pdf.body) && pdf.body.toString("ascii", 0, 4) === "%PDF",
  );
  ok(await api("get", `/payroll/${p._id}/payslip/${other._id}`, emp), 403);
  const d = ok(await api("get", "/dashboard", admin));
  assert.equal(
    d.payrollGrossCents,
    p.lines.reduce((n, l) => n + l.proratedGrossCents, 0),
  );
});
test("announcements, notification ownership, login reset and deactivation", async () => {
  ok(
    await api("post", "/announcements", emp, {
      title: "Unauthorized",
      body: "Must not be posted",
    }),
    403,
  );
  const posted = ok(
    await api("post", "/announcements", hr, {
      title: "Team update",
      body: "Our employee handbook review is open.",
    }),
    201,
  );
  assert.ok(
    ok(await api("get", "/announcements", emp)).some(
      (a) => a._id === posted._id,
    ),
  );
  const notes = ok(await api("get", "/notifications", emp));
  assert.ok(notes.length > 0);
  ok(await api("post", `/notifications/${notes[0]._id}/read`, second), 404);
  assert.equal(
    ok(await api("post", `/notifications/${notes[0]._id}/read`, emp)).read,
    true,
  );
  const reset = ok(
    await api("patch", `/organization/users/${other.userId}`, admin, {
      reset: true,
    }),
  );
  ok(await api("get", "/auth/me", second), 401);
  let login = ok(
    await api("post", "/auth/login", null, {
      email: other.email,
      password: reset.temporaryPassword,
    }),
  );
  assert.equal(login.user.mustChangePassword, true);
  second = ok(
    await api("post", "/auth/password", login.token, {
      currentPassword: reset.temporaryPassword,
      newPassword: strong,
    }),
  ).token;
  ok(
    await api("patch", `/organization/users/${other.userId}`, admin, {
      active: false,
    }),
  );
  ok(await api("get", "/auth/me", second), 401);
  ok(
    await api("post", "/auth/login", null, {
      email: other.email,
      password: strong,
    }),
    401,
  );
  ok(
    await api("patch", `/organization/users/${other.userId}`, admin, {
      active: true,
    }),
  );
});
test("AI unavailable fallback, tool calling, smart-leave retry and logs", async () => {
  delete process.env.AI_API_KEY;
  const refusal = ok(
    await api("post", "/ai/chat", emp, { message: "What is Second's salary?" }),
  );
  assert.equal(refusal.label, "Access-control response");
  assert.match(refusal.answer, /cannot disclose/);
  ok(await api("post", "/ai/chat", emp, { message: "My balance?" }), 503);
  process.env.AI_API_KEY = "test-provider";
  process.env.AI_MODEL = "test-model";
  const realFetch = global.fetch;
  let calls = 0;
  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message:
              ++calls === 1
                ? {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: "c1",
                        type: "function",
                        function: { name: "get_headcount", arguments: "{}" },
                      },
                    ],
                  }
                : {
                    role: "assistant",
                    content: "There are 3 active employees.",
                  },
          },
        ],
      }),
    });
    const answer = ok(
      await api("post", "/ai/chat", hr, { message: "Headcount?" }),
    );
    assert.equal(answer.label, "AI-generated");
    assert.match(answer.answer, /3 active/);
    calls = 0;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: "assistant",
              content:
                ++calls === 1
                  ? "bad JSON"
                  : JSON.stringify({
                      type: "casual",
                      start: "2026-11-02",
                      end: "2026-11-03",
                      reason: "Family wedding",
                    }),
            },
          },
        ],
      }),
    });
    const smart = ok(
      await api("post", "/ai/smart-leave", emp, {
        message: "Next Monday and Tuesday for wedding",
      }),
    );
    assert.equal(smart.requiresConfirmation, true);
    assert.equal(calls, 2);
    assert.equal(smart.values.type, "casual");
    assert.equal(await models.Leave.countDocuments(), 3);
    assert.ok((await models.AILog.countDocuments()) >= 3);
  } finally {
    global.fetch = realFetch;
    delete process.env.AI_API_KEY;
  }
});
test("AI hourly rate limit persists across instances and logout revokes token", async () => {
  const u = await models.User.findOne({ email: employee.email }),
    hour = Math.floor(Date.now() / 3600000);
  await models.RateBucket.findOneAndUpdate(
    { _id: `ai:${u._id}:${hour}` },
    { $set: { count: 20, expiresAt: new Date(Date.now() + 3600000) } },
    { upsert: true },
  );
  ok(await api("post", "/ai/chat", emp, { message: "Balance?" }), 429);
  ok(await api("post", "/auth/logout", emp));
  ok(await api("get", "/auth/me", emp), 401);
});

test("HR chosen temporary passwords, email normalization, repeated resets and scope", async () => {
  const created = ok(await api("post", "/organization/users", admin, {
    name: "Reset Verification",
    email: "  RESET.HR@EXAMPLE.TEST  ",
    temporaryPassword: "FirstHRPassword123!",
  }), 201);
  assert.equal(created.user.email, "reset.hr@example.test");
  assert.equal(created.temporaryPassword, "FirstHRPassword123!");
  const login = ok(await api("post", "/auth/login", null, {
    email: "  RESET.HR@EXAMPLE.TEST  ", password: created.temporaryPassword,
  }));
  assert.equal(login.user.mustChangePassword, true);
  ok(await api("get", "/employees", login.token), 403);
  const changed = ok(await api("post", "/auth/password", login.token, {
    currentPassword: created.temporaryPassword, newPassword: "PersonalHRPassword456!",
  }));
  const resetUrl = `/organization/users/${created.user.id}`;
  ok(await api("patch", resetUrl, changed.token, { reset: true, temporaryPassword: "ForbiddenHRPass123!" }), 403);
  const freshEmployee = ok(await api("post", "/auth/login", null, {email: employee.email, password: strong}));
  ok(await api("patch", resetUrl, freshEmployee.token, { reset: true, temporaryPassword: "ForbiddenHRPass123!" }), 403);
  ok(await api("patch", resetUrl, admin, { reset: true, temporaryPassword: "weak" }), 422);
  ok(await api("patch", resetUrl, admin, { temporaryPassword: "MissingResetFlag123!" }), 422);
  const reset = ok(await api("patch", resetUrl, admin, { reset: true, temporaryPassword: "NewTemporaryHR789!" }));
  assert.equal(reset.temporaryPassword, "NewTemporaryHR789!");
  ok(await api("get", "/auth/me", changed.token), 401);
  ok(await api("post", "/auth/login", null, { email: created.user.email, password: "PersonalHRPassword456!" }), 401);
  const resetLogin = ok(await api("post", "/auth/login", null, { email: created.user.email, password: reset.temporaryPassword }));
  assert.equal(resetLogin.user.mustChangePassword, true);
  const raw = await models.User.findById(created.user.id).select("+password").lean();
  assert.notEqual(raw.password, reset.temporaryPassword);
  assert.equal(raw.temporaryPassword, undefined);
  const logs = await models.Audit.find({ entityId: created.user.id }).lean();
  assert.ok(!JSON.stringify(logs).includes(reset.temporaryPassword));
  ok(await api("post", "/auth/password", resetLogin.token, { currentPassword: reset.temporaryPassword, newPassword: "Aa1" + "é".repeat(40) }), 422);
});
