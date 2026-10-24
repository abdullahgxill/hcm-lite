export const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export function assert(condition, status, message) {
  if (!condition) fail(status, message);
}
