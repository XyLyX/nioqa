# NIOQA backend

Call `supabase.rpc('nioqa_operation', { action, target, body, start_time })` with a signed-in user's access token and the project publishable key. Omit unused arguments. The database derives the caller from Supabase Auth and requires a current session.

| Action | Arguments |
| --- | --- |
| `profile` | `body` is the display name |
| `venues`, `discover` | Lists up to 100 verified venues or available Pings |
| `create` | Venue ID, Ping text and ISO timestamp with timezone |
| `cancel`, `join` | Ping ID |
| `requests` | Optional Ping ID to filter the caller's requests |
| `approve`, `decline` | Join request ID |
| `send`, `messages` | Join request ID and message text for send |
| `block`, `report_participant` | Join request ID and reason for report |
| `block_host`, `report_ping` | Discoverable Ping ID and reason for report |

Chat access ends one hour after the Ping starts, or sooner after cancellation, venue or assurance revocation, or a block in either direction. Approved participants can still report each other after chat closes. Chat rows remain private in the database. A retention schedule and deletion workflow are pending.

A trusted backend must validate assurance-provider results and associate them with the correct Supabase user before setting `verification_status = 'verified'`, `adult_verified_until` and `identity_verified_until`. Clear the relevant expiry or reject the profile on revocation. Store the expiry and outcome, and keep identity documents outside this schema. For venues, a trusted backend must confirm that the provider place represents a public venue before upserting by `(provider, provider_place_id)` and setting `public_verified`. The database checks these flags and expiry times on use. Provider adapters and a moderation queue are pending.

Run `npm test` for domain tests. Run [authorization.sql](../supabase/tests/authorization.sql) as a database administrator against a test Supabase database with both migrations applied. It exercises the actual RPC under anonymous and authenticated database roles and rolls back its fixtures.

Before public deployment, exercise sign-in and the RPC over HTTP using real test accounts, connect and test both verification providers, and confirm moderation, abuse controls and chat retention end to end.
For the hosted HTTP smoke test, provision a confirmed, unassured disposable password account with a .invalid address. Set the four NIOQA environment variables listed in the script, run `node supabase/tests/http-smoke.mjs`, and delete the disposable account afterward. This checks password sign-in, anonymous denial, profile creation, the assurance gate and session revocation.
