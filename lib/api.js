import { findProfile, checkPin, isLocked, recordFail, clearFails } from "./db.js";

export const clientIp = (req) => (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";

/* Checks the profile id and PIN headers. Wrong guesses are throttled per profile, so changing IP doesn't bypass the limit. */
export async function authenticate(req, p) {
  const pid = String(req.headers["x-profile"] || "").slice(0, 40);
  const pin = String(req.headers["x-pin"] || "");
  if (!pid) return { status: 401, error: "Choose a profile" };
  if (await isLocked(p, pid)) return { status: 429, error: "Too many attempts. Wait 15 minutes." };
  const row = await findProfile(p, pid);
  if (!row) return { status: 401, error: "Unknown profile" };
  if (!(await checkPin(pin, row.pin_hash))) {
    await recordFail(p, pid);
    return { status: 401, error: "Wrong PIN" };
  }
  await clearFails(p, pid);
  return { pid, profile: row };
}
