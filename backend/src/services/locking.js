import { Company } from "../models/index.js";
// Serializes financial writes with payroll finalization, including competing functions.
export async function lockLedger(session) {
  return Company.findByIdAndUpdate(
    "company",
    { $inc: { ledgerVersion: 1 } },
    { session, new: true },
  );
}
