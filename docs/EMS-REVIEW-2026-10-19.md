# EMS review — 19 October 2026

This release opens automated overseas quotes only for ordinary merchandise to the United Kingdom, Germany, France and Australia. Other destinations remain manual while route, contents and duty handling are reviewed. Thailand retains the shop's THB50 domestic flat charge; that is not described as a carrier EMS tariff.

## Evidence
- Thailand Post's current EMS merchandise table: https://file.thailandpost.com/upload/content/EMS%20World%20%2068%20update%20TW%2020%20._679c8953edf59.pdf (linked by its official Thai EMS World page).
- 1 March 2026 amendment affects Argentina, Djibouti, Israel, North Macedonia, Senegal and Slovakia: https://international.thailandpost.com/4-3-2569/ . These are outside this release's enabled destinations.
- US prepaid-duty conditions remain separate: https://international.thailandpost.com/11-9-2569/ . Do not offer US postage alone as a complete quote.
- UK/DE zone3: 250g1190,500g1280,1kg1380,2kg1730 THB; France zone4 and Australia zone9:1760,1840,2020,2390 THB respectively. Existing table cells for these routes are retained after comparison with the current linked PDF. AU max20kg; UK/DE/FR max30kg.
- Latest retrieved BOT USD reference: THB33.5410/USD,15October2026,lastupdated16October18:00: https://app.bot.or.th/BTWS_STAT/statistics/BOTWEBSTAT.aspx?reportID=123 . One final cents rounding; no overseas postage markup.
- Official service notice reports possible UK delay: https://international.thailandpost.com/16-4-2569/ . Carrier estimates are not guaranteed arrival dates.

The carrier calculator was attempted as an additional check but its own upstream reported a certificate-chain problem; no TLS bypass was attempted. The tariff comparison, not the calculator, supports this release.

Catalogue weights plus one200g packing allowance determine a quote. A physical packed-weight check remains an operations requirement before fulfilment; do not silently charge the buyer an extra amount. Re-review rates/FX/service availability before19November2026. Overseas quotes fail closed after that date, without taking down the separate shop-funded domestic rate.

Automatic overseas contents are limited to the board game, hand fan, cork coaster, bottle without coffee, T-shirt and umbrella. Coffee, bamboo and smoking-related items require an individual destination/contents check. Destination taxes/duties are not collected by these quotes. No cannabis export is offered.

## Payment acceptance
Fixtures cover authenticated owner-only verification, signed raw-body Stripe webhooks, authoritative amount/currency/type/quote matching, concurrent/repeated callbacks, retry session reuse, expiration before cancellation, timeout/idempotency recovery and explicit refusal of an untracked legacy retry. They never call live Stripe, connect production data or send customer email. Real Stripe-account test-mode delivery acceptance is still separate; do not label fixtures a real completed payment.

Customer order email remains off unless ORDER_EMAIL_ENABLED=true is deliberately configured after its delivery setup. Family and event email settings are independent. No old messages are replayed by this release.
