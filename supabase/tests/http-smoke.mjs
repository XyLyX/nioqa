import assert from "node:assert/strict";

const { NIOQA_URL, NIOQA_PUBLISHABLE_KEY, NIOQA_TEST_EMAIL, NIOQA_TEST_PASSWORD } = process.env;
assert.ok(NIOQA_URL && NIOQA_PUBLISHABLE_KEY && NIOQA_TEST_EMAIL && NIOQA_TEST_PASSWORD,
  "Set NIOQA_URL, NIOQA_PUBLISHABLE_KEY, NIOQA_TEST_EMAIL and NIOQA_TEST_PASSWORD");
assert.ok(NIOQA_PUBLISHABLE_KEY.startsWith("sb_publishable_"), "Use a publishable key");
assert.ok(NIOQA_TEST_EMAIL.endsWith(".invalid"), "Use a disposable test account");
const origin = new URL(NIOQA_URL);
assert.equal(origin.protocol, "https:");

async function post(path, payload, token) {
  const headers = { apikey: NIOQA_PUBLISHABLE_KEY, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(new URL(path, origin), {
    method: "POST", headers, body: JSON.stringify(payload), redirect: "error",
    signal: AbortSignal.timeout(15_000)
  });
}

const rpc = "/rest/v1/rpc/nioqa_operation";
const anonymous = await post(rpc, { action: "discover" });
assert.equal(anonymous.status, 401, "Anonymous discovery must be denied");

const login = await post("/auth/v1/token?grant_type=password", {
  email: NIOQA_TEST_EMAIL, password: NIOQA_TEST_PASSWORD
});
assert.equal(login.status, 200, "Disposable account must sign in");
const { access_token: token, user } = await login.json();
assert.ok(token && user?.id);

try {
  const profile = await post(rpc, { action: "profile", body: "NIOQA smoke test" }, token);
  assert.equal(profile.status, 200, "Signed-in user must be able to create a profile");
  assert.deepEqual(await profile.json(), { user_id: user.id });
  const gated = await post(rpc, { action: "venues" }, token);
  assert.equal(gated.status, 403, "Account without an age declaration must be denied");
  assert.equal((await gated.json()).code, "42501");
  const declaration = await post(rpc, { action: "declare_adult", body: "I confirm I am 18 or older" }, token);
  assert.equal(declaration.status, 200);
  assert.deepEqual(await declaration.json(), { adult_declared: true });
  assert.equal((await post(rpc, { action: "venues" }, token)).status, 200);
} finally {
  const logout = await post("/auth/v1/logout", {}, token);
  assert.equal(logout.status, 204, "Test session must be revoked");
}

const revoked = await post(rpc, { action: "profile", body: "NIOQA smoke test" }, token);
assert.equal(revoked.status, 403, "Revoked session must be denied");
assert.equal((await revoked.json()).code, "42501");
console.log("NIOQA HTTP smoke checks passed");
