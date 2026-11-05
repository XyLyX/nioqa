import { createSignIn } from "/sign-in.js";

const accountLink = document.querySelector("#account-link");
const accountCta = document.querySelector("#account-cta");
const accountIntro = document.querySelector("#account-intro");
const google = document.querySelector("#google");
const onboarding = document.querySelector("#onboarding");
const logout = document.querySelector("#logout");
const status = document.querySelector("#status");
const supabase = window.supabase.createClient(
  "https://uajcobqgfgjyuzeiqllv.supabase.co", "sb_publishable_RJlSbXzv5JnK0mErQhcMdw_SJDpkr8p",
  { auth: { flowType: "pkce", detectSessionInUrl: false } }
);
const signIn = createSignIn(supabase, { googleCallbackUrl: location.origin + "/auth/callback" });

async function render() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const signedIn = Boolean(data.session);
  accountLink.textContent = signedIn ? "My account" : "Sign in";
  accountLink.hidden = false;
  accountCta.textContent = signedIn ? "My account" : "Get started";
  accountIntro.textContent = signedIn
    ? "Manage your session and complete your profile if needed."
    : "Sign in and set up your NIOQA profile. This preview tests account setup.";
  google.hidden = signedIn;
  logout.hidden = !signedIn;
  onboarding.hidden = true;
  if (!signedIn) {
    status.textContent = "Use the Google account approved for testing.";
    return;
  }
  const gate = await supabase.rpc("nioqa_operation", { action: "venues" });
  if (gate.error && gate.error.code !== "42501") throw gate.error;
  onboarding.hidden = !gate.error;
  status.textContent = gate.error ? "Complete your NIOQA profile." : "You’re signed in and your NIOQA profile is ready.";
}

function handle(button, action, failure) {
  return async event => {
    event.preventDefault();
    button.disabled = true;
    try { await action(); }
    catch { status.textContent = failure; }
    finally { button.disabled = false; }
  };
}

google.addEventListener("click", handle(google, () => signIn.startGoogle(), "Couldn’t start Google sign-in. Try again."));
onboarding.addEventListener("submit", handle(onboarding.querySelector("button"), async () => {
  await signIn.completeOnboarding({
    displayName: document.querySelector("#display-name").value.trim(),
    confirmsAdult: document.querySelector("#adult").checked
  });
  await render();
}, "Couldn’t save your profile. Check the display name and try again."));
logout.addEventListener("click", handle(logout, async () => {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
  await render();
}, "Couldn’t sign out. Try again."));

let callbackFailed = false;
if (location.pathname === "/auth/callback") {
  const code = new URLSearchParams(location.search).get("code");
  history.replaceState(null, "", "/");
  try { await signIn.finishGoogle(code); }
  catch { callbackFailed = true; }
}
try {
  await render();
  if (callbackFailed) status.textContent = "Google sign-in didn’t finish. Start again from this browser.";
} catch {
  status.textContent = "Couldn’t check your session. Reload to try again.";
}
