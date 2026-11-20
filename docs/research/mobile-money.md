# Mobile money providers for fares

Research for issue #8. Scope: small, frequent fares (₦300–₦700 per ride), sandbox only,
no live payments and no payouts to owners. Fees and product terms change often — confirm
them with each provider before launch.

## Comparison

| | Paystack | Flutterwave | MTN MoMo API (direct) |
|---|---|---|---|
| Fee on a small payment | 1.5% + ₦100 for local NG transactions; ₦100 waived under ₦2,500, cap ₦2,000. A ₦400 fare costs ~₦6. | ~2.0% for local NG transactions (capped ₦2,000); ~1.4% quoted for some GH/KE rails. A ₦400 fare costs ~₦8. | Typically 1.5–2.5% merchant fee by country, sometimes 0–1% charged to the customer. |
| Countries | Nigeria, Ghana, Kenya, Côte d'Ivoire, South Africa. Mobile money channel: Ghana, Kenya, Côte d'Ivoire. | 30+ countries in Africa; broad mobile money and card coverage. | MTN markets (e.g. Ghana, Uganda, Cameroon, Côte d'Ivoire); one integration and contract per country. |
| Sandbox | Yes, instant with test keys from the dashboard. | Yes, test mode from the dashboard. | Yes, but developer-portal signup, API user/keys and callback registration are needed. |
| Webhook | `charge.success`, signed HMAC-SHA512 in `x-paystack-signature` over the raw body. | Event POST, verified with a shared `verif-hash` header. | Callback URL configured per API user; verification depends on the country product. |
| Payout speed | Automatic settlement next working day (T+1) in the local market. | Instant to T+1 on some rails, T+2–T+3 on others. | T+1 to T+3 depending on country and product. |
| Integration cost | Small: one REST API and one webhook. Docs are generally considered the clearest of the three. | Small: one REST API and one webhook, more country/rail options to test. | Higher: separate onboarding, OAuth/API-key flow and go-live approval per market (often 5–14 days). |

Sources: [Paystack pricing](https://paystack.com/pricing),
[Paystack payment channels](https://paystack.com/docs/payments/payment-channels),
[Flutterwave webhooks](https://developer.flutterwave.com/docs/webhooks),
[MTN MoMo API](https://momo.mtn.com/api),
[2026 operator fee comparison](https://kolonell.com/en/blog/mobile-money-api-integration-cost-country-comparison-2026),
[aggregator comparison](https://kolonell.com/en/blog/payment-aggregators-anglophone-paystack-flutterwave-2026),
[Nigerian gateway comparison](https://tofali.dev/guides/comparing-nigerian-payment-gateways).

## Decision: Paystack

1. The first pilot is Lagos (NGN), where Paystack has the lowest effective fee for a ₦400 fare
   (the ₦100 fixed fee is waived below ₦2,500) and next-day settlement.
2. The mobile money channel covers Ghana, Kenya and Côte d'Ivoire when the pilot expands,
   without negotiating a separate telco contract per country.
3. Sandbox keys and webhooks are available immediately, so an end-to-end test needs no real money.
4. The webhook signature is a plain HMAC-SHA512 over the raw body, easy to verify correctly
   with a constant-time comparison.

Flutterwave stays a fallback if wider country coverage becomes more valuable than fee size.
A direct MTN MoMo integration is not worth its onboarding cost at this volume.

## What this repository implements

- A provider-neutral payments API in `server/`, currently with two adapters:
  - `sandbox` (default): creates a pending payment and sends a correctly signed
    `charge.success` webhook to the local handler after a short delay. No keys, no network.
  - `paystack`: calls `POST /charge` with the secret key and a mobile money phone number;
    final status comes from the signed `charge.success` webhook.
- Only a **confirmed** webhook writes a fare to the store. Pending requests, failed events,
  wrong amounts and invalid signatures never create a fare. Duplicate webhooks are idempotent.
- All secrets come from environment variables (see `server/.env.example`); none are in the
  web app, in Git, or in API responses.

## Sandbox end-to-end run

See `README.md` → *Mobile money sandbox API*.
