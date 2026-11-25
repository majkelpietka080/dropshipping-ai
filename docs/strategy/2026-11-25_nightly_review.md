# Giovetta Living — nightly supplier & launch review (2026-11-25)

**Run:** 25 Nov 2026, 22:04 CET  
**Scope:** Read-only Shopify, official supplier/source revalidation, Notion record hygiene, launch blockers.  
**No Shopify changes, supplier contact, account creation, contract, order, purchase, publication or ad spend.**

## Shopify current state
- Exact product search count: **0 ACTIVE**.
- Exact count: **409 DRAFT**.
- First 5 DRAFT samples returned: all inventory 0, vendor Aosom, last updated 2026-10-31.
- Current product search does not expose Online Store channel publication status; not independently checked.
- No product status, price, inventory, publication or theme change made.

## New supplier — Nordform Design (conditional)
Polish direct manufacturer; chairs, upholstered chairs, swivel chairs, bar stools, salon chairs. Single-order dropshipping B2B conditions on official page: no binding agreement, no order minimum, 1 unit, no charge for standard parcel prep or XML/tools, XML and stock updates. No public refresh cadence or B2B prices. FAQ allows unregistered activity, but suspended Giovetta status is not individually confirmed.

Public retail reference SKUs:
- 000307 Horten light grey velvet/chrome cross — PLN 279
- 000222 Horten black eco-leather/gold base — PLN 299
- 001595 Kvam Diamonds black velvet/graphite disc — PLN 349
- 001534 Ardal cream/gold disc — PLN 371 (public stock 46 at check)

Retail shipping/returns: site states PLN 25 prepayment / PLN 30 COD, preparation 1 day, 14-day returns; **not confirmed as B2B dropshipping terms**. B2B cost, shipping SLA, oversized fees, VAT/invoice, returns, packaging, tracking and automatic orders remain unknown. HOLD products.

Illustrative maximum B2B gross product-cost ceilings for 30% contribution margin: customer shipping S=19.99, assumed supplier shipping Cs=25 (retail rate, not confirmed), Shopify Payments 1.95% and PLN 1.20/order:
`Cmax = 0.6805 × (P + S) − 1.20 − Cs`
P=279 → 177.26; 299 → 190.87; 349 → 224.90; 371 → 239.87. These are cost ceilings, not margin forecasts. Recalculate using actual B2B costs and VAT treatment.

Notion record: https://app.notion.com/p/423241ec5e738143bff4f94f091baa9b

## Official-source revalidation
### DOBOXA (existing record)
Official site confirms print-on-demand/drop fulfillment, home wall-art/posters/canvas/wallmurals, no minimum, white label and automatic orders; official site states Poland delivery in 1–2 working days. Shopify App Store listing says product upload and publication are automatic and orders go to production automatically—**auto-publish risk**. Do not install unless draft-only behavior is confirmed. Existing Notion email summary (not independently read this run) says production 2–4 days, shipping from PLN 16.09 net, neutral packing, no subscription/MOQ, custom products not returned. Website delivery claim vs production time requires clarification. HOLD for SKU cost, VAT and shipping/returns.

Notion: https://app.notion.com/p/423241ec5e73818d832ed0f53a740c21  
Official: https://doboxa.com/en/  
Shopify App Store: https://apps.shopify.com/doboxa-dropshipping-print-app

### Donaco (existing record, no duplicate)
Official terms rechecked: PLN 18 gross domestic dropship courier; 1–3 business days after supplier payment; no minimum value; no additional dropship, packing or XML/CSV fees; company NIP; PDF invoice; no marketing inserts; stock on site and XML/CSV reported equal (refresh cadence not published). Returns only factory defects; DPA required; ordinary full-value consumer returns not accepted by supplier. Conditional; product cost unknown.

Notion: https://app.notion.com/p/41a241ec5e7381f9838df899e60e15f3  
Official: https://www.donaco.pl/i7,dropshipping.html  
Official cooperation: https://www.donaco.pl/i1,wspolpraca-hurtowa.html

### Keno (existing record)
Official site confirms Polish maker in Dobroń, handmade cotton mats for bathroom/bedroom/living room; collections Karo, Linea, Kronos, Lido, Gaja, Elips, Quatro. Public Lido retail size 60x60–160x80 cm, PLN 238–572 (not B2B). Public B2B page describes individual offer, made-to-order, samples and delivery arrangements; it does not publicly confirm dropship/Base Connect SLA. Existing Notion email summary reports single-order dropship/Base Connect and ~PLN 20 GLS; email not independently read this run. Supplier price file missing, so HOLD.

Notion: https://app.notion.com/p/423241ec5e7381bdbdd2efd22568b4e8  
Official: https://keno.pl/produkty  
B2B: https://keno.pl/wspolpraca  
Lido: https://keno.pl/lido

### Pastelowa Nitka (existing record)
Official Base Connect listing exists. Public supplier terms not independently accessible in this run; existing Notion email summary says dropshipping, own courier labels, no fee/MOQ and VAT-exempt accepted. Requires Giovetta's own courier account; B2B costs, shipping, dispatch, returns, tracking and actual automation remain missing.

Notion: https://app.notion.com/p/423241ec5e73816cb76fff783bdef282  
Base listing: https://base.com/en-IN/integrations/blconnect_pastelowanitka/

## Platforms
- Base official docs: Base Connect connections have no additional integration fee and unlimited Connect suppliers can be linked; standard XML/API integrations: first free, each additional standard integration PLN 50 net/month. Supplier connection code is obtained from supplier. No integration configured.
- hurtB2B official platform: 12 suppliers, 8,846 offers reported; free buyer platform, company NIP, supplier-specific minimums. Wholesale sourcing only, not confirmed dropship.
- DecoriQ is an importer/wholesale catalogue (651 products; private-label MOQ 300 pcs/model). Not single-order dropship, excluded from qualified candidate count.

## Supplier inbox summary — Notion only, Gmail unavailable in automation
- VANUBA: new dropship partnerships from January 2027; wholesale offer now requires owner decision.
- KOBI Meble: furniture offer; not current priority.
- GardenFlora: no requested matching assortment.
- Keno: supplier file missing; Notion summary flags duplicate outgoing email; owner should check sent mail.
- DOBOXA: B2B registration link required; no registration performed.
- Gmail connector required interactive input and could not be read directly. This run did not send any supplier messages.

## Launch blockers and next actions
1. Import/obtain B2B prices, stock, supplier shipping, VAT and return costs from 12 Polish suppliers; no SKU is cleared without cost data.
2. Select 10–20 launch SKUs with current stock, quality/fit and >=30% contribution margin. Avoid catalog-size vanity.
3. Owner/ accountant confirms business reactivation and VAT treatment.
4. Owner approves Base Connect supplier connections and own courier label account where required.
5. Selected items imported as DRAFT and re-read; verify stock, variant, pricing, shipping and claims. No bulk publish.
6. Owner approves product status, Online Store channel publication, password/checkout and payment test.
7. Prepare ad assets only for products actually ACTIVE and published. No campaign launch or spend before explicit approval.

**Approvals:** business reactivation/VAT; courier account; supplier/B2B/Base Connect accounts and DPAs; SKU shortlist and price; product activation/publication; password/checkout; ad accounts, placement and budget.

The earlier “3 November / 08:00” instruction is stale. This report is for 25 November and does not promise a specific time.
