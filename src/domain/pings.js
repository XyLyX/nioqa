// NIOQA domain rules. These helpers do not authorize publishing or joining.
// All checks must be repeated server-side against authenticated identity and RLS.
export const PING_LIFETIME_MS = 60 * 60 * 1000;
export const MAX_FUTURE_MS = 48 * 60 * 60 * 1000;
export const PING_STATES = Object.freeze({
  UPCOMING: "upcoming",
  ACTIVE: "active",
  EXPIRED: "expired"
});

export function pingWindow(startsAt, now = Date.now()) {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) throw new TypeError("Invalid start time");
  const current = typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(current)) throw new TypeError("Invalid current time");
  const endsAt = start + PING_LIFETIME_MS;
  return {
    status: current < start ? PING_STATES.UPCOMING :
      current >= endsAt ? PING_STATES.EXPIRED : PING_STATES.ACTIVE,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(endsAt).toISOString()
  };
}

export function validatePingDraft(draft, now = Date.now()) {
  const errors = [];
  const text = typeof draft?.text === "string" ? draft.text.trim() : "";
  if (text.length < 3 || text.length > 280) errors.push("Ping text must be 3–280 characters");
  const venueId = typeof draft?.venueId === "string" ? draft.venueId.trim() : "";
  if (!venueId) errors.push("A verified public venue is required");
  const start = Date.parse(draft?.startsAt);
  if (!Number.isFinite(start) || start < now - 60_000 || start > now + MAX_FUTURE_MS) {
    errors.push("Choose now or a time within the next 48 hours");
  }
  return { valid: errors.length === 0, errors };
}

export function canViewApprovedChat({ approved, blocked, closesAt }, now = Date.now()) {
  return approved === true && blocked !== true &&
    Number.isFinite(Date.parse(closesAt)) && now < Date.parse(closesAt);
}
