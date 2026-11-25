# Nordform Design — supplier audit (2026-11-25)

**Status:** CONDITIONAL / HOLD for SKUs  
**Type:** Direct Polish manufacturer; single-order dropshipping  
**Fit:** Home & Living (selected neutral seating only)

## Officially confirmed B2B conditions
- No binding cooperation agreement; no order minimum; purchase from one piece.
- No extra charge for standard parcel preparation or XML/integration tools.
- Wholesale discounts from first order; no turnover thresholds. B2B prices appear after company registration/approval.
- XML product catalogue and stock quantity updates are offered. Refresh cadence is not published.
- EU/outside-Poland dropshipping requires agreement.
- FAQ says unregistered business activity may cooperate; it does not confirm Giovetta's suspended business status.

## Catalogue shortlist (public retail, NOT B2B costs)
- SKU 000307 — Horten, light grey velvet, chrome cross base — PLN 279 retail.
- SKU 000222 — Horten, black eco-leather, gold base — PLN 299 retail.
- SKU 001595 — Kvam Diamonds, black velvet, graphite disc base — PLN 349 retail.
- SKU 001534 — Ardal, cream, gold disc base — PLN 371 retail; public page showed 46 units at time checked.
Only neutral, year-round colours are shortlisted; avoid seasonal/bright colours and beauty-salon chairs.

## Delivery / returns / packing
Retail page states: preparation 1 day, GLS/InPost, PLN 25 prepayment / PLN 30 COD, 14-day return. **These are retail terms and are NOT confirmed B2B dropshipping rates or SLA.** B2B carrier, parcel size surcharge, delivery time, label/neutral packing, tracking and returns/RMA remain unknown.

## Integration
XML and stock updates are available; frequency not stated. Shopify-native/API/CSV/Base Connect, automatic order forwarding and Shopify tracking sync are not confirmed. Treat as product-feed integration only until order flow is verified.

## 30% contribution-margin threshold (illustrative)
Assume customer shipping charged separately at S=PLN 19.99 and supplier shipping Cs=PLN 25 (retail rate, **not confirmed B2B**). With Shopify Payments 1.95% and PLN 1.20/order:
`Cmax = 0.6805 × (P + S) − 1.20 − Cs`
Maximum gross supplier product cost at the displayed retail P:
| Retail P | Maximum B2B gross product cost if Cs=25 |
|---:|---:|
| 279 | 177.26 |
| 299 | 190.87 |
| 349 | 224.90 |
| 371 | 239.87 |

This is a ceiling, not an expected margin. Recalculate with the supplier's actual B2B gross cost, shipping and tax treatment. As Giovetta is VAT-exempt, don't assume invoice net price is the final cost.

## Missing data / risks
- B2B product prices/discounts and SKU inventory.
- Dropship-specific cost/time and oversized surcharges.
- Invoice issuer, VAT treatment, VAT-ID requirement/acceptance of VAT-exempt entity.
- Consumer returns vs B2B RMA, defects/damage handling.
- Neutral/brand packaging and no supplier price paperwork.
- XML refresh cadence, Shopify/Base Connect/API/CSV support, order forwarding and tracking.
- Exact fulfilment warehouse and courier for dropship.

**Decision:** CONDITIONAL supplier; HOLD products until all cost and fulfilment fields are verified. No account, email, contract, order or Shopify change performed.

## Official sources checked 2026-11-25
- https://www.nordform.pl/warunki-wspolpracy,175.html
- https://www.nordform.pl/
- https://www.nordform.pl/fotele-obrotowe.html
- https://www.nordform.pl/kontakt.html
