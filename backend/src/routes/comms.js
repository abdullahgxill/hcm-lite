import { Router } from "express";
import { z } from "zod";
import { Announcement, Notification, Audit } from "../models/index.js";
import { roles } from "../middleware/auth.js";
import { validate, isoDate } from "../validators/index.js";
import { transaction } from "../config/db.js";
import { audit } from "../services/audit.js";
import { analytics } from "../services/analytics.js";
import { runAI, toolNames } from "../services/ai.js";
import { assert } from "../utils/errors.js";
export const comms = Router();
comms.get("/announcements", async (req, res) =>
  res.json(
    await Announcement.find()
      .populate("actor", "name")
      .sort({ createdAt: -1 })
      .limit(100),
  ),
);
comms.post(
  "/announcements",
  roles("ADMIN", "HR"),
  validate(
    z.object({
      title: z.string().trim().min(2).max(150),
      body: z.string().trim().min(3).max(4000),
    }),
  ),
  async (req, res) =>
    res.status(201).json(
      await transaction(async (session) => {
        const a = (
          await Announcement.create([{ ...req.body, actor: req.user._id }], {
            session,
          })
        )[0];
        await audit(
          req.user,
          "post",
          "announcement",
          a._id,
          null,
          req.body,
          session,
        );
        return a;
      }),
    ),
);
comms.get("/notifications", async (req, res) =>
  res.json(
    await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100),
  ),
);
comms.post("/notifications/:id/read", async (req, res) => {
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { read: true },
    { new: true },
  );
  assert(n, 404, "Notification not found.");
  res.json(n);
});
comms.get("/audit", roles("ADMIN"), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  res.json({
    items: await Audit.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * 25)
      .limit(25),
    total: await Audit.countDocuments(),
    page,
  });
});
const filters = z
  .object({
    start: isoDate.optional(),
    end: isoDate.optional(),
    department: z.string().max(150).optional(),
  })
  .strict();
comms.get("/ai/status", (req, res) => res.json({
  configured: !!(process.env.AI_API_KEY && process.env.AI_MODEL),
  liveReportsAvailable: true,
  rateLimitPerHour: 20,
}));
comms.get("/dashboard", async (req, res) =>
  res.json(await analytics(req.user, filters.parse(req.query))),
);
comms.post(
  "/ai/:kind",
  validate(
    z.object({
      message: z.string().trim().min(1).max(2000).optional(),
      filters: filters.optional(),
      tool: z.enum(toolNames).optional(),
    }),
  ),
  async (req, res) => {
    assert(
      ["chat", "summary", "smart-leave", "report"].includes(req.params.kind),
      404,
      "AI operation not found.",
    );
    assert(
      ["summary", "report"].includes(req.params.kind) || req.body.message,
      422,
      "Enter a message.",
    );
    assert(req.params.kind !== "report" || req.body.tool, 422, "Choose a report.");
    res.json(await runAI(req.user, req.params.kind, req.body));
  },
);
