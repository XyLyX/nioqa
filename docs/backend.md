# NIOQA backend

Call `supabase.rpc('nioqa_operation', { action, target, body, start_time })` with a signed-in user's access token and the project publishable key. Omit unused arguments. The database derives the caller from Supabase Auth and requires a current session.

| Action | Arguments |
| --- | --- |
| `profile` | `body` is the display name |
| `declare_adult` | After profile creation and explicit confirmation, send `body: 'I confirm I am 18 or older'` |
| `venues`, `discover` | Lists up to 100 verified venues or available Pings |
| `create` | Venue ID, Ping text and ISO timestamp with timezone |
| `cancel`, `join` | Ping ID |
| `requests` | Optional Ping ID to filter the caller's requests |
| `approve`, `decline` | Join request ID |
| `send`, `messages` | Join request ID and message text for send |
| `block`, `report_participant` | Join request ID and reason for report |
| `block_host`, `report_ping` | Discoverable Ping ID and reason for report |

Chat access ends one hour after the Ping starts, or sooner after cancellation, venue revocation, or a block in either direction. Approved participants can still report each other after chat closes. Chat rows remain private in the database. A retention schedule and deletion workflow are pending.

NIOQA uses self-declared age. Show this copy before submitting the declaration and when users plan a meetup.

> I confirm I am 18 or older. NIOQA relies on self-declared age and does not verify identities. You are responsible for following the venue’s rules. Venue staff have final discretion over admission and service, including age and ID requirements.

A trusted backend or administrator must confirm that a venue is open to the public before upserting by `(provider, provider_place_id)` and setting `public_verified`. The database checks that flag on use. A moderation queue is pending.

Run `npm test` for domain tests. Run [authorization.sql](../supabase/tests/authorization.sql) as a database administrator against a test Supabase database with both migrations applied. It exercises the actual RPC under anonymous and authenticated database roles and rolls back its fixtures.

Before public deployment, exercise sign-in and the RPC over HTTP using real test accounts, confirm venue review, and confirm moderation, abuse controls and chat retention end to end.
For the hosted HTTP smoke test, provision a confirmed disposable password account with a .invalid address. Set the four NIOQA environment variables listed in the script, run `node supabase/tests/http-smoke.mjs`, and delete the disposable account afterward. This checks password sign-in, anonymous denial, profile creation, the age declaration gate and session revocation.
For the verified meetup HTTP test, use an isolated Supabase project or an empty prelaunch project. Provision two confirmed disposable password accounts with .invalid addresses, plus one disposable verified venue. Set NIOQA_URL, NIOQA_PUBLISHABLE_KEY, NIOQA_HOST_EMAIL, NIOQA_GUEST_EMAIL, NIOQA_TEST_PASSWORD and NIOQA_TEST_VENUE, then run node supabase/tests/http-meetup.mjs. Remove the test reports, blocks, messages, requests, Pings, accounts and venue afterward.
