import { Audit, Notification } from "../models/index.js";
const redact = (value) => {
  if (!value) return value;
  return JSON.parse(
    JSON.stringify(value, (key, v) =>
      /password|token|secret|basicCents|salary/i.test(key) ? "[REDACTED]" : v,
    ),
  );
};
export function audit(actor, action, entity, entityId, before, after, session) {
  return Audit.create(
    [
      {
        actor: actor?._id,
        actorName: actor?.name || "Initial setup",
        action,
        entity,
        entityId: String(entityId),
        before: redact(before),
        after: redact(after),
      },
    ],
    { session },
  );
}
export function notify(userId, title, body, session) {
  return Notification.create([{ userId, title, body }], { session });
}
