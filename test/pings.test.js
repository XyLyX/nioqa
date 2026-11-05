import test from "node:test";
import assert from "node:assert/strict";
import { pingWindow, validatePingDraft, canViewApprovedChat } from "../src/domain/pings.js";

const start = "2026-11-05T10:00:00.000Z";
test("upcoming, active and expired are separate states", () => {
  assert.equal(pingWindow(start, Date.parse(start) - 1).status, "upcoming");
  assert.equal(pingWindow(start, Date.parse(start)).status, "active");
  assert.equal(pingWindow(start, Date.parse(start) + 3_599_999).status, "active");
  assert.equal(pingWindow(start, Date.parse(start) + 3_600_000).status, "expired");
});
test("draft requires a venue identifier, not a free-text location", () => {
  assert.equal(validatePingDraft({text:"Coffee?",startsAt:start}, Date.parse(start)).valid,false);
  assert.equal(validatePingDraft({text:"Coffee?",venueId:"venue-123",startsAt:start},Date.parse(start)).valid,true);
});
test("unapproved, blocked or expired chats cannot be viewed", () => {
  const now = Date.parse(start);
  assert.equal(canViewApprovedChat({approved:false,blocked:false,closesAt:start},now),false);
  assert.equal(canViewApprovedChat({approved:true,blocked:true,closesAt:"2026-11-05T11:00:00Z"},now),false);
  assert.equal(canViewApprovedChat({approved:true,blocked:false,closesAt:start},now),false);
});
