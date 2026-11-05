import assert from "node:assert/strict";

const { NIOQA_URL, NIOQA_PUBLISHABLE_KEY, NIOQA_HOST_EMAIL, NIOQA_GUEST_EMAIL,
  NIOQA_TEST_PASSWORD, NIOQA_TEST_VENUE } = process.env;
assert.ok(NIOQA_URL && NIOQA_PUBLISHABLE_KEY?.startsWith("sb_publishable_"));
assert.ok(NIOQA_HOST_EMAIL?.endsWith(".invalid") && NIOQA_GUEST_EMAIL?.endsWith(".invalid"));
assert.notEqual(NIOQA_HOST_EMAIL, NIOQA_GUEST_EMAIL);
assert.ok(NIOQA_TEST_PASSWORD && NIOQA_TEST_VENUE);
const origin = new URL(NIOQA_URL);
assert.equal(origin.protocol, "https:");

async function post(path, payload, token, expected = 200) {
  const headers = { apikey: NIOQA_PUBLISHABLE_KEY, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(new URL(path, origin), {
    method: "POST", headers, body: JSON.stringify(payload), redirect: "error",
    signal: AbortSignal.timeout(15_000)
  });
  assert.equal(response.status, expected, `${payload.action ?? path} returned ${response.status}`);
  if (expected !== 204) return response.json();
}

const rpc = (token, payload, expected) => post("/rest/v1/rpc/nioqa_operation", payload, token, expected);
const sessions = [];

async function signIn(email) {
  const { access_token: token } = await post("/auth/v1/token?grant_type=password",
    { email, password: NIOQA_TEST_PASSWORD });
  assert.ok(token);
  sessions.push(token);
  return token;
}

try {
  const host = await signIn(NIOQA_HOST_EMAIL);
  const guest = await signIn(NIOQA_GUEST_EMAIL);
  for (const [token, name] of [[host, "Disposable host"], [guest, "Disposable guest"]]) {
    await rpc(token, { action: "profile", body: name });
    await rpc(token, { action: "declare_adult", body: "I confirm I am 18 or older" });
  }
  assert.ok((await rpc(host, { action: "venues" })).some(venue => venue.id === NIOQA_TEST_VENUE));
  const { id: ping } = await rpc(host, {
    action: "create", target: NIOQA_TEST_VENUE, body: "NIOQA HTTP test",
    start_time: new Date().toISOString()
  });
  assert.ok((await rpc(guest, { action: "discover" })).some(item => item.id === ping));

  const { id: request } = await rpc(guest, { action: "join", target: ping });
  assert.ok(request);
  assert.deepEqual(await rpc(guest, { action: "join", target: ping }), { id: request });
  assert.equal((await rpc(guest, { action: "approve", target: request }, 403)).code, "42501");
  assert.equal((await rpc(guest, { action: "messages", target: request }, 403)).code, "42501");
  await rpc(host, { action: "approve", target: request });

  await rpc(host, { action: "send", target: request, body: "Test message" });
  const messages = await rpc(guest, { action: "messages", target: request });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].body, "Test message");
  assert.equal(messages[0].mine, false);

  await rpc(guest, { action: "block", target: request });
  assert.equal((await rpc(host, { action: "messages", target: request }, 403)).code, "42501");
  assert.equal((await rpc(guest, { action: "send", target: request, body: "Blocked" }, 403)).code, "42501");
  assert.ok(!(await rpc(guest, { action: "discover" })).some(item => item.id === ping));
  assert.ok((await rpc(guest, {
    action: "report_participant", target: request, body: "Disposable safety report"
  })).id);
  await rpc(host, { action: "cancel", target: ping });
} finally {
  await Promise.all(sessions.map(token => post("/auth/v1/logout", {}, token, 204)));
}

console.log("NIOQA verified meetup HTTP checks passed");
