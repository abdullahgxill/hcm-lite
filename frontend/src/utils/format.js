export const money = (c) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 2,
  }).format((c || 0) / 100);
export const number = (v) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(v || 0);
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const timestamp = (v) =>
  v
    ? new Date(v).toLocaleString("en-PK", {
        timeZone: "Asia/Karachi",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
export const time = (v) =>
  v
    ? new Date(v).toLocaleTimeString("en-PK", {
        timeZone: "Asia/Karachi",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
