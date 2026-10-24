import mongoose from "mongoose";
let pending;
export async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!process.env.MONGODB_URI)
    throw Object.assign(
      new Error("Database is not configured. Set MONGODB_URI on the backend."),
      { status: 503 },
    );
  if (mongoose.connection.readyState === 0) pending = null;
  pending ??= mongoose
    .connect(process.env.MONGODB_URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 7000,
    })
    .catch((e) => {
      pending = null;
      throw e;
    });
  await pending;
  return mongoose.connection;
}
export async function transaction(callback) {
  return mongoose.connection.transaction(callback);
}
