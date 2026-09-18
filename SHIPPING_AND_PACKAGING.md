# Shipping and plastic-free packaging

Prepared 18 September 2026. This is the implementation and fulfilment handover, not a claim that unmeasured parcels or every destination are ready for sale.

## Pricing and checkout

Merchandise is sold in whole USD: round each unit up before multiplying quantity. For example, a $6.01 grinder becomes $7; two cost $14. Postage is excluded from merchandise and charged once per order. Shipping remains in USD cents; conversion rounds up one cent to cover THB postage. Paid historical orders retain their original amounts.

`POST /api/orders/shipping-quote` loads products from MongoDB, ignores browser prices and weights, and returns the merchandise subtotal, postage, packing mass and quote ID. `POST /api/orders` reloads the same data and requires the reviewed quote ID, subtotal and shipping cost. A change returns 409 before Stripe. Retry payment checks the current quote too; legacy pending orders must start a fresh checkout.

New merchandise payment sessions expire after 31 minutes, and international lanes must remain verified for at least that period when quoting. This prevents a new unpaid session from retaining old prices/postage for Stripe's usual day-long lifetime. Paid orders retain the quote used for payment.

## Rate source and service

The [Thailand Post EMS World merchandise tariff](https://file.thailandpost.com/upload/content/Update!%20%20EMS%20World%20%202567%20(%201%20..%2067%20)_65b31890bf21d.pdf), effective 1 February 2024, supplies the checked-in country zones, destination weight caps and merchandise brackets. This is a published tariff snapshot, not a live carrier API. UK/Germany are zone 3, USA zone 17, Singapore zone 1. Six transcription errors in the previous table are corrected. The document tariff is not used for goods.

[EMS World](https://international.thailandpost.com/services/ems-world/?lang=en) charges by actual gross parcel mass, including all packaging; this service does not apply a volumetric formula. Country-specific caps of 20 or 30 kg include packing. Other couriers may use volumetric weight and surcharges; do not apply this calculator to them.

Before enabling a lane, verify current acceptance and prices using the [official rate calculator](https://international.thailandpost.com/find-rates/?lang=en) and the accepting post office. Check the 250/500/1000 g boundaries and larger brackets the shop will sell. The calculator lists a separate US package service; the generic historical tariff does not establish that the US lane is currently bookable or has no additional charges. Confirm that service explicitly before enabling it. Update the tariff source/version whenever its current rates differ. Confirm CN23, commercial invoice and any product-specific import requirements. Recipient-paid import duties and local taxes are disclosed at checkout and are not included in postage.

The default configuration keeps international payment unavailable until rates and packing are verified. It preserves the existing domestic shop policy of 50 THB per order and the existing fixed merchant conversion of 33 THB per USD. This is not represented as a live FX rate. Set the merchant conversion in the deployment configuration when verifying prices; the quote records it for audit. Packing materials are absorbed by the shop, not charged as an undisclosed handling fee.

## Measured packing configuration

In the product editor, enter the measured grams of individual paper wrap or fitted protection. Blank means unmeasured; explicit zero means none is needed. Approve each product for each destination only after carrier and import checks. Coffee and natural bamboo products need their own destination checks. Standard international parcels exclude Matches and Zippo/lighters even if an approval is mistakenly selected. [DHL Thailand also classifies matches and lighters as dangerous goods](https://www.dhl.com/th-en/home/ecommerce/business-help-center/prohibited-goods.html); this is not a product that can simply be sent through another standard courier.

Supply a JSON file via `SHIPPING_CONFIG_PATH`, or update `src/config/shipping.json`. Required settings:

| Setting | Meaning |
| --- | --- |
| `version` | Identifier for the measured packing method; change it when packing changes |
| `thbPerUsd` | Positive merchant conversion used for USD postage |
| `domesticPostageThb` | Domestic flat postage policy, currently 50 |
| `enabledCountries` | Names from `/api/orders/shipping-countries`, verified for current EMS goods service |
| `ratesVerifiedUntil` | ISO timestamp after which international quoting stops; renew after checking rates and service |
| `packingProfiles` | Tested outer cartons/mailers with `id`, `productIds`, `maxNetGrams`, `maxUnits`, `outerPackagingGrams` |

For every profile, use actual product IDs, weigh the complete outer carton, sealing tape, labels, shared padding and documents, and certify every permitted mix up to its unit/mass limits fits and is protected. Use narrow profiles and `maxUnits: 1` when only a single-product shipment has been tested. Individual wrap is entered separately per product. The calculator adds individual protection per unit and the shared outer packing once. No profile is provided with invented measurements. Combinations outside tested profiles require a manual quote instead of automatic payment. Verify product weights against a scale too, including primary product packaging already supplied with the item.

Measure representative fully packed orders and compare their gross weights to quotes, especially just above each tariff boundary. Do not enter a guessed average or subtract padding to obtain a cheaper bracket. Reweigh whenever materials or the packing method change. Split-parcel rates require a separate implementation; overweight baskets currently require a manual quote.

## Plastic-free packing method

Keep the existing promise: no plastic shipping bags, bubble wrap, foam, plastic tape, laminated windows or plastic document pouches. Compostable bioplastic mailers still contain plastic. A paper-looking material is not sufficient proof: check coatings, reinforcement, adhesives and carrier-added wrapping.

| Contents | Proposed protection | Verification before shipping |
| --- | --- | --- |
| T-shirts, cloth bags, hats | Unlaminated kraft/corrugated mailer; paper tissue only if useful | Rub, moisture and handling trial; measure the complete pack |
| Grinders, trays, game and rolling kits | Corrugated carton, expanded honeycomb paper wrap, kraft void fill | No movement inside; inspect sharp edges and perform transit trial |
| Glass bottles/jars | Fitted corrugated or moulded-pulp supports and suitable corrugated carton | Drop/handling trial with the actual glass item; honeycomb wrap alone is not a tested glass solution |
| Coffee/tea | Preserve a verified food-safe primary barrier, protect it with paper shipping materials | Confirm the primary pack contains no plastic; do not assume plain paper maintains shelf life |
| Umbrellas/long items | Fitted corrugated long box and paperboard end protection | Test dimensions, movement and the carrier's size limits; weigh separately |

Use unreinforced water-activated kraft tape with documented paper/starch composition. Some reinforced paper tapes contain plastic or glass fibres; request the material specification. Use paper labels without PP/PET film. Check adhesive and backing composition with the supplier. Agree a paper-only method for affixing CN23 and invoices with the accepting carrier; do not let its standard plastic pouch or overwrap break the promise. Confirm all components before approving the packing profile.

## Thai supplier leads

| Supplier | Verified offering | Next information to obtain |
| --- | --- | --- |
| [Material World, Nonthaburi](https://materialworld.co.th/en/honeycomb-paper-wrap) | Expandable honeycomb paper wrap, 500 mm × 250 m, 80 gsm; manual dispensing; paper interleaf | Composition, roll/sample price, minimum order, delivery to Phuket and actual packing trials. 02-5016300; sales@materialworld.co.th; Line @mwofficial |
| [Slist Thailand](https://slistthailand.co.th/en/honeycomb-board-en/) | Honeycomb paperboard that can be cut for protective inserts | Composition/adhesive declaration, suitable thickness, cut samples, price and minimum order |

These are supplier leads, not purchased materials or established costs. No supplier has been contacted. Corrugated cartons, moulded-pulp supports, verified tape and paper labels still need suitable local quotes. Select the smallest protective pack that passes the trials; its scale weight determines postage.

## Carrier alternatives to compare

EMS is the implemented service, not an assertion that it is the cheapest. Obtain like-for-like quotes for the same measured pack and destination. The official Thailand Post calculator also offers ePacket and international air parcels; compare their current destination limits, tracking, compensation and delivery estimates before adding them as checkout options. No ePacket tariff is inferred from the EMS table.

[DHL Express in Thailand](https://www.dhl.com/th-en/home/ship/document-and-parcel-shipping-options.html) is an alternative for urgent or higher-value orders, subject to product acceptance and an actual quote. Its [Thai packaging guide](https://www.dhl.com/discover/en-th/logistics-advice/essential-guides/guide-to-dhl-express-box-sizes) describes volumetric billing: compare actual gross kg with length × width × height in cm / 5000. A future DHL option must use its verified billable-weight rules, account rates and surcharges; this EMS calculator cannot be reused for it. Request corrugated packaging and paper-only paperwork handling explicitly. Do not equate DHL Express acceptance with the different DHL eCommerce service.

Record the verified all-in postage, packaging mass, paper-only handling and fulfilment cost for each candidate before selecting it. The checkout currently offers a manual quote when the supported EMS method is unavailable, rather than inventing a price for another carrier.

## Release order and validation

1. Stage the backend and frontend together. The new backend requires a reviewed shipping quote, so an old checkout client cannot submit an order after the change. Schedule both releases to avoid a checkout interruption.
2. Keep international lanes disabled while weighing, testing and entering product/profile data. Confirm paper-only carrier handling. Enable only verified destinations/products and set a documented review expiry.
3. Expire existing unpaid Stripe checkout sessions with legacy prices/postage during release. Already-created sessions cannot be corrected by these repository changes. Preserve paid orders.
4. In Stripe test mode, verify domestic, UK, US (only after service confirmation), EU and nearby Asia as enabled; compare the scale, published THB band, USD shipping line, discount and final total. No live payments are needed for validation.
5. Run `npm test`; shipping tests cover packed boundaries, country caps, the corrected grid entries, unavailable service/data, dangerous goods, malformed carts and changed/tampered quotes. Controller tests verify that the actual payment path uses database prices and cannot charge forged postage.
