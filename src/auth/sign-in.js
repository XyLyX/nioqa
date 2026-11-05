const ADULT_DECLARATION = "I confirm I am 18 or older";

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export function createSignIn(supabase, { googleCallbackUrl }) {
  return {
    async startGoogle() {
      return unwrap(await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: googleCallbackUrl }
      }));
    },

    async finishGoogle(code) {
      if (typeof code !== "string" || !code.trim()) {
        throw new TypeError("Missing Google sign-in code");
      }
      return unwrap(await supabase.auth.exchangeCodeForSession(code));
    },

    async sendEmailCode(email) {
      return unwrap(await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true }
      }));
    },

    async verifyEmailCode(email, code) {
      const token = code.trim();
      if (!/^\d{6}$/.test(token)) throw new TypeError("Enter the six-digit sign-in code");
      return unwrap(await supabase.auth.verifyOtp({ email: email.trim(), token, type: "email" }));
    },

    async completeOnboarding({ displayName, confirmsAdult }) {
      if (confirmsAdult !== true) throw new TypeError("Confirm that you are 18 or older");
      unwrap(await supabase.rpc("nioqa_operation", { action: "profile", body: displayName }));
      return unwrap(await supabase.rpc("nioqa_operation", {
        action: "declare_adult",
        body: ADULT_DECLARATION
      }));
    }
  };
}
