# Giovetta Living — supplier revalidation and launch blockers
**Date:** 2026-11-23  
**Owner:** ChatGPT — strategy, supplier research and launch readiness  
**Technical handoff:** Claude / operational agent  
**Notion report:** https://app.notion.com/p/421241ec5e7381719c3ddce9c9e073dd

## Executive summary

- The supplier registry contains 149 records. The last full qualification audit (2026-11-20) found 21 independent suppliers with a documented single-order shipping route to Poland. This meets the minimum of 20, but does not mean all are ready for launch or have complete SKU costs.
- This run revalidated and enriched existing records for Sollux, MONDEX, Marlotte and Gift Deco/MIRTOP. One duplicate Giftdeco record was flagged and excluded from the unique supplier count.
- No new supplier was added merely to inflate the count. EWAX was not counted: a third-party Sky-Shop page mentions dropshipping, but the official supplier site does not publicly confirm single-order dropshipping terms.
- No new 30% margin calculation was possible because selected B2B SKU prices are not public. Missing cost = HOLD.

## Critical Shopify blocker

Shopify Admin API search at approximately 22:50 returned **409 DRAFT, 0 ACTIVE**. This conflicts with the Claude report from 06:42 on the same date, which reported **164 ACTIVE / 245 DRAFT**. Cause and actor are unknown.

**Do not reactivate products or change publication status.** Claude/operational agent should audit Shopify activity history, app logs, imports and bulk operations to identify when, how and by whom the change occurred.

Additional read-only findings:
- Store: Giovetta Living; primary domain giovettaliving.com; SSL enabled; setupRequired=false; PLN; Basic plan.
- MAIN theme remains “Giovetta Living — przedpremierowy układ” (last updated 2026-10-30). Dawn and Horizon remain UNPUBLISHED.
- taxesIncluded=true and taxShipping=false; correctness requires accountant review.
- Shopify Payments status could not be read because the connector lacks read_shopify_payments scope.
- Public domain was not accessible through the browser check. The morning report said password protection was enabled; current password status was not independently readable.
- No changes were made to Shopify.

## Supplier revalidation

| Supplier | Type / status | Newly confirmed | Remaining blockers |
|---|---|---|---|
| Sollux Lighting | Direct Polish manufacturer / CONDITIONAL | Single-unit dropshipping; no start/service fees, no monthly minimum and no long-term contract; 17 PLN gross per order, regardless of parcel count; own label for parcel locker/COD; orders before 10:00 usually dispatch same day; daily stock availability; customer tracking link; direct customer returns within 14 days; supplier-handled claims | B2B SKU prices and live stock; active-business/VAT-ID and invoice requirements; neutral packaging; confirmed Shopify/API/XML/CSV/BaseLinker integration; automated tracking back to Shopify; warranty discrepancy (dropshipping FAQ says 24 months while some product pages show 5 years) |
| MONDEX (Cookini, BathLab) | Direct wholesaler / HOLD | 3,000+ products; no subscription or minimum order value; 200 PLN net refundable activation fee after 1,000 PLN net purchases within 12 months; 3.50 PLN net packing per order; Shopify via Base Connect, XML/CSV/API; automatic product/price/stock sync and order/label transfer; dispatch max 3 business days, orders before noon usually same day | B2B SKU prices; own courier label and carrier cost; Base Connect package cost; VAT and active-business requirements; neutral packing not available by default; customer returns go to Giovetta first, supplier return fee 10% net (min 5 PLN net/item), with category exclusions. Current page lists PDF/ZPL 100×150 label; old 10 PLN A4 fee not reconfirmed |
| Marlotte | Direct Polish furniture manufacturer / HOLD | No MOQ or account fee; partner price includes delivery; Poland delivery approx. 1–2 business days; same-day dispatch for orders before 10:00; 30-day return for unused/unassembled furniture; XML/CSV/API; automatic Shopify order forwarding | Official B2B page asks for EU VAT number and shop URL before releasing partner price list. Exact SKU price, invoice/VAT model for a Polish VAT-exempt company, activity requirements, standard-SKU neutral packing and return transport cost still need confirmation |
| Gift Deco / MIRTOP | Direct wholesaler / CONDITIONAL | Dropshipping direct to no-name B2C customers is permitted; XML prices/stocks updated 3× daily; Sky-Shop integration; usual dispatch within 1 business day | Dropshipping only for registered businesses; B2B SKU price and PL shipping cost not public; retail shipping rates are not B2B rates; B2B returns, claims, invoice/VAT and neutral packing unclear. Duplicate record flagged |
| AW Dropship EU | EU platform / CONDITIONAL (existing record) | Dispatch from Slovakia; Poland Packeta rates: 4.40 EUR (0–1 kg), 4.80 EUR (1–2 kg), 5.00 EUR (2–5 kg); table shows 1–2 business days from dispatch; no subscription | Business-only registration; without valid EU VAT ID in VIES, VAT is charged according to destination country; accountant must confirm treatment for the VAT-exempt business. General T&C show 3–5 days; SKU price/live stock and returns for specific products remain to be confirmed |

### Sollux product shortlist — price request only

- [UGO 30 chrom pendant](https://sollux-lighting.com/pl/nasza-oferta/lampy-wiszace/lampa-wiszaca-ugo-30-chrom/)
- [QUBIC black pendant](https://sollux-lighting.com/pl/nasza-oferta/lampy-wiszace/lampa-wiszaca-qubic-czarna/)
- [MAGNET ceramic wall light](https://sollux-lighting.com/pl/nasza-oferta/kinkiety/kinkiet-ceramiczny-magnet/)
- [SULA 1 natural wood pendant](https://sollux-lighting.com/pl/nasza-oferta/lampy-wiszace/lampa-wiszaca-sula-1-naturalne-drewno/)

These are product candidates only. No wholesale costs or current B2B stock were public, so no margin is calculated and no product is approved for import.

## Pricing rules retained

- Target margin: 30%.
- Shopify Payments variable fee: 1.95%.
- Fixed fee: 1.20 PLN once per order, not per SKU.
- Supplier-to-customer shipping must be separate from the shipping amount charged by Giovetta.
- Net supplier prices are not automatically the final cost for a VAT-exempt Polish business or EU cross-border purchases.
- Do not use the historical 20 PLN minimum profit rule or automatic 1% undercut rule.
- Missing SKU cost, shipping, VAT treatment or live stock means HOLD.

## Launch readiness

**Ready:** domain/SSL and basic Shopify setup; supplier base above 20 qualified candidates from the prior audit; fresh supplier terms documented; concrete Sollux SKUs identified for B2B price verification.

**P0 blockers:**
1. Explain 164 ACTIVE → 409 DRAFT status change.
2. Confirm password protection, public storefront and real checkout.
3. Confirm Shopify Payments activation and payout account in Admin.
4. Confirm business resumption and VAT/VAT-UE with accountant.
5. Obtain B2B SKU prices and complete landed costs before approving any product.

**No ads or product copy were produced for individual SKUs:** the current Admin API read returned no ACTIVE products, and the supplier prices required for a truthful offer are unavailable. No campaigns or spend were initiated.

## Conditional path to 2026-11-27

- **24 Nov:** Claude/operational agent audits the status change. Owner checks Shopify Payments, payout account, password and checkout. Accountant confirms business and VAT/VAT-UE.
- **25 Nov:** select 10–20 in-stock SKUs only after supplier costs, shipping, returns and 30% margin are confirmed.
- **26 Nov:** only with owner approval, selectively activate and publish chosen products; test checkout, payment, shipping, order emails and returns.
- **27 Nov:** soft launch only if all P0 blockers are cleared and order handling is ready. Paid ads require separate budget approval.

If the status change, payment and checkout blockers remain unresolved, launch by 27 Nov is not safe; move the date rather than publish an untested store.

## Official sources

- Sollux: https://sollux-lighting.com/pl/wspolpraca/dropshipping/
- MONDEX: https://mondex.pl/content/42-dropshipping
- Marlotte: https://marlotte.pl/en/b2b
- Gift Deco: https://giftdeco.pl/dla-partnerow,23
- AW Dropship EU shipping: https://www.aw-dropship.eu/shipping
- AW Dropship EU terms: https://www.aw-dropship.eu/terms-and-conditions

## Notion handoff

- Supplier database: https://app.notion.com/p/0b8ecb9c6c3e4f41809edee513d4d9a5
- Operations: https://app.notion.com/p/40d241ec5e7381d0911eee9f691928c8
- P0 Shopify status audit: https://app.notion.com/p/421241ec5e738116b8d6ed4da5d13a88
- P0 payments/checkout confirmation: https://app.notion.com/p/421241ec5e73816c9775d3bd8ee9623c
