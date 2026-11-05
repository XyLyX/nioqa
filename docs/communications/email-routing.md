# NIOQA v1.0 — Email routing and contact policy

Status: **routing specification committed; mailbox provisioning and application integration pending**.

| Address | Responsibility | Exposure |
| --- | --- | --- |
| admin@nioqa.app | Internal operations, moderation escalation, security incidents, service alerts | Internal only |
| hello@nioqa.app | General enquiries, press, feedback | Public footer and Contact page |
| partner@nioqa.app | Public-venue and business partnerships | Partnerships page |
| support@nioqa.app | Account access, technical support, complaints, user assistance | Public Help/Support and account settings |

## Routing requirements

1. **User/Ping/chat reports:** Save an auditable moderation case first, notify `admin@nioqa.app` through a server-side notification system, and acknowledge the reporter in-app. Do not rely on email delivery as the sole moderation record.
2. **Security and operational alerts:** Send only to `admin@nioqa.app`; never include secrets or unnecessary personal data.
3. **Account/technical enquiries:** Route to `support@nioqa.app`. Authentication/OTP emails must use a verified transactional sender, not a contact mailbox by assumption.
4. **Venue/business proposals:** Route to `partner@nioqa.app`.
5. **General/press enquiries:** Route to `hello@nioqa.app`.
6. **Replies:** Use the appropriate role address as Reply-To, only after verified sender-domain configuration. Apply rate limits, spam controls, access controls and retention policies.
7. **Public exposure:** Never publish `admin@nioqa.app` as a general contact. Show `hello@nioqa.app` and `support@nioqa.app` in their appropriate public surfaces; show `partner@nioqa.app` on Partnerships.
8. **No false availability:** Do not display contact addresses as functioning until inbound receipt and outbound reply are tested. No mailbox or alias is created by this specification.

## Acceptance checks

- Verify DNS and provider mailbox/alias provisioning for all four addresses.
- Verify inbound delivery and replies independently for each address.
- Verify SPF, DKIM and DMARC alignment for outbound sending.
- Verify moderation cases persist if notification delivery fails.
- Verify reports and personal details are not exposed in public logs or email templates.
- Verify only authorized administrators can view moderation alerts and case details.

NIOQA remains a global, location-agnostic product. No waitlist or geographic launch restrictions.
