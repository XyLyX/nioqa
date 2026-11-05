import assert from "node:assert/strict";
import test from "node:test";
import { createSignIn } from "../src/auth/sign-in.js";

const googleCallbackUrl = "https://example.test/auth/callback";

test("Google starts OAuth with the configured callback and exchanges a code", async () => {
  const signIn = createSignIn({
    auth: {
      async signInWithOAuth(args) {
        assert.deepEqual(args, { provider: "google", options: { redirectTo: googleCallbackUrl } });
        return { data: { url: "https://example.test/authorize" } };
      },
      async exchangeCodeForSession(code) {
        assert.equal(code, "callback-code");
        return { data: { session: { user: { id: "user" } } } };
      }
    }
  }, { googleCallbackUrl });

  assert.ok((await signIn.startGoogle()).url);
  await assert.rejects(signIn.finishGoogle(""), /Missing/);
  assert.equal((await signIn.finishGoogle("callback-code")).session.user.id, "user");
});

test("email signup uses a code and propagates provider errors", async () => {
  const invalidCode = new Error("Code expired");
  const signIn = createSignIn({
    auth: {
      async signInWithOtp(args) {
        assert.deepEqual(args, { email: "a@example.test", options: { shouldCreateUser: true } });
        return { data: {} };
      },
      async verifyOtp(args) {
        assert.deepEqual(args, { email: "a@example.test", token: "012345", type: "email" });
        return { error: invalidCode };
      }
    }
  }, { googleCallbackUrl });

  await signIn.sendEmailCode(" a@example.test ");
  await assert.rejects(signIn.verifyEmailCode("a@example.test", "123"), /six-digit/);
  await assert.rejects(signIn.verifyEmailCode(" a@example.test ", " 012345 "), invalidCode);
});

test("onboarding requires explicit consent before writing the profile or age declaration", async () => {
  const calls = [];
  const signIn = createSignIn({
    async rpc(name, args) {
      assert.equal(name, "nioqa_operation");
      calls.push(args);
      return { data: {} };
    }
  }, { googleCallbackUrl });

  await assert.rejects(signIn.completeOnboarding({ displayName: "Alex", confirmsAdult: "true" }), /18 or older/);
  assert.deepEqual(calls, []);
  await signIn.completeOnboarding({ displayName: "Alex", confirmsAdult: true });
  assert.deepEqual(calls, [
    { action: "profile", body: "Alex" },
    { action: "declare_adult", body: "I confirm I am 18 or older" }
  ]);
});
