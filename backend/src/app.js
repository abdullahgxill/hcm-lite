import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import { connectDB } from "./config/db.js";
import { authenticate } from "./middleware/auth.js";
import { publicAuth, privateAuth } from "./routes/auth.js";
import { organization } from "./routes/organization.js";
import { employees } from "./routes/employees.js";
import { attendance } from "./routes/attendance.js";
import { leaves } from "./routes/leaves.js";
import { payroll } from "./routes/payroll.js";
import { comms } from "./routes/comms.js";
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      const allowed = (process.env.CORS_ORIGIN || "http://localhost:5173")
        .split(",")
        .map((s) => s.trim());
      if (!origin || allowed.includes(origin)) cb(null, true);
      else
        cb(Object.assign(new Error("Origin is not allowed."), { status: 403 }));
    },
    exposedHeaders: ["Content-Disposition"],
  }),
);
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", async (req, res) => {
  try {
    await connectDB();
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "unavailable", database: "not connected" });
  }
});
app.use("/api", async (req, res, next) => {
  await connectDB();
  next();
});
app.use(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    message: { message: "Too many attempts. Please try again later." },
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use(
  "/api/auth/setup",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    message: { message: "Too many attempts. Please try again later." },
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use("/api/auth", publicAuth);
app.use("/api", authenticate);
app.use("/api/auth", privateAuth);
app.use("/api/organization", organization);
app.use("/api/employees", employees);
app.use("/api/attendance", attendance);
app.use("/api/leaves", leaves);
app.use("/api/payroll", payroll);
app.use("/api", comms);
app.use((req, res) => res.status(404).json({ message: "Route not found." }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === "entity.parse.failed")
    return res.status(400).json({ message: "Invalid JSON request body." });
  if (error instanceof ZodError)
    return res.status(422).json({
      message: "Please correct the highlighted fields.",
      errors: error.issues.map((e) => ({
        field: e.path.join("."),
        reason: e.message,
      })),
    });
  if (error.code === 11000)
    return res.status(409).json({
      message:
        "A record with this unique code, email, date or month already exists.",
    });
  if (error.name === "CastError")
    return res.status(422).json({ message: "Invalid record identifier." });
  const status = error.status || 503;
  res.status(status).json({
    message: error.status
      ? error.message
      : "The service is unavailable. Please try again.",
    ...(process.env.NODE_ENV === "test" ? { detail: error.message } : {}),
  });
});
export default app;
