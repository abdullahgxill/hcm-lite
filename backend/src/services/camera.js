import { z } from "zod";
import { assert } from "../utils/errors.js";

export const attendanceCaptureSchema = z.object({
  source: z.enum(["web", "camera"]).default("web"),
  faceCount: z.number().int().min(0).max(20).optional(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().nonnegative().max(100000),
    capturedAt: z.number().finite(),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.source === "camera" && (value.faceCount === undefined || !value.location))
    ctx.addIssue({ code: "custom", message: "Camera attendance needs a face detection result and a fresh location." });
  if (value.source === "web" && (value.faceCount !== undefined || value.location))
    ctx.addIssue({ code: "custom", message: "Use camera attendance to submit verification data." });
}).default({ source: "web" });

export function cameraPolicy(company) {
  return {
    enabled: Number.isFinite(company.latitude) && Number.isFinite(company.longitude),
    radiusMeters: company.radius,
    maxAccuracyMeters: 100,
    storesPhoto: false,
  };
}

export function distanceMeters(a, b) {
  const rad = (n) => n * Math.PI / 180;
  const lat = rad(b.latitude - a.latitude), lon = rad(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function verifyCapture(data, company, now = new Date()) {
  if (data.source !== "camera") return undefined;
  assert(cameraPolicy(company).enabled, 422, "Ask your Admin to configure the office latitude, longitude and radius before using camera attendance.");
  assert(data.faceCount === 1, 422, "Camera attendance needs exactly one face. Try again or request an HR correction.");
  assert(data.location.accuracy <= 100, 422, "Location accuracy must be 100 metres or better. Move near a window or try your phone; otherwise request an HR correction.");
  const age = now.getTime() - data.location.capturedAt;
  assert(age >= -15000 && age <= 60000, 422, "Your location has expired. Capture a new location and try again.");
  const distance = distanceMeters(data.location, company);
  assert(distance <= company.radius + 0.000001, 422, "You are outside the configured office radius. Camera attendance cannot be recorded; contact HR for a correction.");
  // Keep only the verification result: never save a photo, face descriptor or raw GPS coordinate.
  return { faceCount: 1, accuracyMeters: data.location.accuracy, distanceMeters: Math.round(distance * 100) / 100, checkedAt: now };
}
