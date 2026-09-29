# Shop pricing and Phase-I checkout

## Source of truth

Products retain their existing `price` (USD) and `weight` (kg). `src/config/store-prices.json` is the reviewed, one-time reconciliation plan, not a runtime price override. It uses the conversation's verified THB prices and 33.28 THB/USD, rounded up to the next whole USD per the user’s 29 September instruction, without postage. T-shirt is THB 1,300, USD 40. The plan deliberately does not assign a price to Rolling kit or Storage jar: neither appears in the inspected POS export.

The export `export_product_all_25_04_2026-3.xlsx`, modified 16 September 2026, is at https://docs.google.com/spreadsheets/d/1gdJpXJ-GY2CvPox6GIZ4bWmg7nCcVtpp/edit. It conflicts with the earlier discussion on Smoking bag, Matches and Hand fan (160 vs 150 THB), and Zippo (3,300 vs 3,000 THB). The user resolved these discrepancies on 17 September 2026: use 160 THB for Smoking bag, Matches and Hand fan, and 3,300 THB for Zippo. The pricing plan now uses those confirmed values. Small grinder uses the handover's verified 200 THB mapping, not the separate Small Classic Grinder SKU at 350 THB. Do not reverse-engineer the missing kit/jar prices from marked-up USD values.

`npm run prices:plan` prints the change plan without connecting. `npm run prices:apply` needs the shop's `MONGO_URI`. It preflights identities and old values, uses field-level compare-and-set writes, reads back each change, and is safe to rerun. It never modifies weights, photos, categories, or flags. It also removes the unverified UV claim from Storage jar and replaces the temporary Umbrella copy with factual, modest wording. The plan contains previous values for reversal; do not overwrite a subsequent admin edit blindly.

## Shipping configuration

`src/config/shipping-rates.json` is the maintained carrier snapshot. It contains:

- The official Thailand Post EMS World merchandise/package table linked by the carrier's service page, published 10 January 2024, effective 1 February 2024; source URL is recorded in the file. Checked 17 September 2026. No live carrier call is made at checkout.
- Country-to-zone mapping and destination-specific maximum parcel weights, including 20 kg destinations. Zero rates mean unavailable, never free shipping. The old browser mapping had incorrect zones for several countries, including the UK, US and Singapore.
- A single 200 g packaging allowance per order. This is an explicit starting shop configuration, not a measured package weight. Weigh actual packing materials and revise it as needed.
- The agreed 33.28 THB per USD reference rate, shared with this price reconciliation. It is not a live FX feed. No shipping markup is added.
- The pre-existing domestic policy of 50 THB, converted to USD; this is a shop flat rate, not an international tariff.
- A review-due date. Quotes fail closed once it passes. Review tariffs, service suspensions and country limits at https://international.thailandpost.com/services/ems-world/?lang=en before extending the date. Remove suspended destinations from the mapping. Change the version whenever rates, destinations, limits, FX or packaging change. Run tests and redeploy the API. Packaging is included in weight limits, including domestic orders.

Only EMS World is implemented. ePacket and dimensional-weight services are not guessed or advertised. Carrier acceptance of the actual contents remains a fulfilment responsibility.

## API and payment

`GET /api/orders/shipping-config` returns supported countries. `POST /api/orders/quote` requires normal authentication and accepts `orderItems: [{product, quantity}]`, `destinationCountry`, and optional `discountCode`. It loads products and discounts from MongoDB, validates quantities/stock/weights, computes cents, and returns the complete authoritative quote. Client price, weight, shipping cost, and discount amounts are ignored.

`POST /api/orders` additionally requires a nonempty shipping address and the last reviewed `quoteId`. The server recomputes the quote and rejects mismatches with 409 before payment. `quoteId` is a deterministic fingerprint, not a trusted client total or an authorization token. Authentication establishes order ownership. The saved order contains the pricing/rate/weight snapshot. Stripe uses the same product cents, one shipping option, and a product-only discount. Coupon creation failure aborts payment instead of charging undiscounted prices. Webhook handling now preserves raw bytes, and paid-order processing checks currency and amount against the saved Phase-I quote.

Payment retries recompute prices and shipping and reject changed or legacy quotes. Customers must start a new checkout if an old pending order lacks a verified quote; old client-supplied prices cannot bypass validation through retry. Existing paid orders are not repriced.

## Rollout

Pricing and description corrections are live. The checkout implementation remains local in both repositories and has not been deployed.

This backend lives in the separate `GrandmaJazz/Grandma.Jazz.Backend` repository, locally `/Users/accorreya/Grandma.Jazz.Backend`. The Next.js changes live in `/Users/accorreya/Grandma.Jazz`.

1. Resolve missing POS prices if available; otherwise leave the two entries explicitly pending.
2. Completed 17 September: all 15 confirmed prices and both description corrections were saved through Joy’s authenticated admin session and read back from the public API. All 17 weights were preserved. Rolling kit remains $65 and Storage jar $25 pending a verified POS source. No database credentials are committed.
3. Coordinate backend and frontend release: new order creation requires `quoteId`, so the old frontend cannot submit to the new API. Use a short maintenance window or a simultaneous release. Do not add an insecure fallback for old clients.
4. Verify authenticated quotes for Thailand, UK, US, Japan and an unavailable/overweight destination. In Stripe test mode verify the displayed total, Stripe total, saved order, webhook and retry agree. No live charge is needed.
5. Reproduce the original intermittent admin upload problem with an authenticated account. Persistent frontend errors/timeouts are already present; this change also fixes partial updates resetting featured/stock flags and strict numeric validation in the API. The original intermittent upload cause has not been established.

Local tests mock MongoDB/Stripe and verify real HTTP controllers, boundaries, tampering, discounts, stale quotes and payment configuration. Backend `lint`/`build` are JavaScript syntax checks (no transpilation). They are not a claim of production payment verification.

## 29 September 2026 price update

All 15 fractional product prices were rounded up and saved in the live admin, with each saved value verified. Existing whole-dollar prices (Storage jar $25, Rolling kit $65) were unchanged. The reconciliation plan now reflects whole-dollar prices so it cannot restore the superseded fractional prices. Shipping calculations retain cents.
