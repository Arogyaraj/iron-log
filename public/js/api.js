// Talks to /api. Every call except sign-in sends the profile id and PIN headers.
import { S } from "./store.js";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let onSessionEnd = () => {};
export const setSessionEnd = (fn) => { onSessionEnd = fn; };

export async function api(path, { method = "GET", body, login = false, keepalive = false } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", "x-profile": S.pid, "x-pin": S.pin },
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive,
    });
  } catch {
    throw new ApiError(0, "You're offline");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !login && S.pid) onSessionEnd("Session ended. Choose a profile.");
    throw new ApiError(res.status, data.error || `Error ${res.status}`);
  }
  return data;
}

const KEY = "il-session";
export const session = {
  save() { sessionStorage.setItem(KEY, JSON.stringify({ pid: S.pid, pin: S.pin })); },
  load() { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; } },
  clear() { sessionStorage.removeItem(KEY); S.pid = ""; S.pin = ""; },
};
