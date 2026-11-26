# Giovetta Living — nightly review (2026-11-26)

## Shopify live read
- Store: Giovetta Living, giovettaliving.com, Basic, PLN, Poland.
- Admin GraphQL confirmed: 409 DRAFT, 0 ACTIVE, 0 ARCHIVED.
- Online Store publication: 0 products. Shop and POS channels: 0.
- No product status, publication, price, tax, payment, shipping, theme or password settings changed.
- Claude's 06:42 report: password enabled, 0 orders, app count 12→10 (Hertwill and Syncee removed). App removal needs owner confirmation because it may stop sync and differs from the earlier intention to leave Hertwill unchanged.
- Claude's product review: 134 non-Hertwill products, all DRAFT, 23 A / 39 B / 72 C. All 134 inventory 0; costs present but supplier shipping, weights and final margin incomplete. A = quality shortlist only, not activation-ready.

## New supplier research
### Sellteo — CONDITIONAL (multi-category platform/aggregator)
- 100k+ products; no subscription/minimum/account/feed fees; standard wholesale discount 2%; neutral carton.
- Full products.xml refresh daily; stany.xml refresh every 10 minutes. BaseLinker-compatible; native Shopify integration not confirmed.
- Poland-only fulfilment. Shipping: Orlen Paczka PLN 11.99; DPD Pickup PLN 13.99; Paczkomat InPost PLN 16.99; InPost courier PLN 19.90 (free from PLN 199 merchandise value); DPD courier PLN 19.90; GLS PLN 25.99; >30kg PLN 40. Own label: PLN 1.99 packaging. Dispatch same day if paid by 10:00.
- Tracking number sent to store by email only; no Shopify tracking sync confirmed.
- Important returns risk: B2B no return without cause; consumer returns require individual prior agreement; no automatic return handling.
- Official: https://b2b.sellteo.pl/dropshipping.html ; https://b2b.sellteo.pl/regulamin-hurtowy.html

### Multistore / ECOTOYS — PROPOSAL (direct wholesaler)
- Brands ModernHome, MultiGarden, KADEN, ECOTOYS, Petsi; home, garden, small appliances, kitchen, furniture, travel/outdoor.
- XML/CSV feed with prices, SRP, stocks, descriptions and images. Integration to Shopify/BaseLinker not confirmed.
- Dropship shipping: Poczta Polska PLN 15.99 (2–3 days); InPost/Paczkomat/UPS PLN 17.99 (1–2 days); DPD PLN 18.99 (1–2 days); own label PLN 3.99; dispatch same day for paid orders before 13:30.
- XML/VIP subscriptions shown on official page; price and whether required unknown. Returns/neutral packing and VAT requirements not verified.
- Official: https://www.hurtowniamultistore.pl/wspolpraca-hurtowa-dla-firm,p22.html ; https://www.hurtowniamultistore.pl/koszty-dostawy,p26.html ; https://www.hurtowniamultistore.pl/integracje,c152.html

### ByEcoHurt — CONDITIONAL (direct manufacturer)
- 3D decorative wall panels, one-piece dropshipping, no MOQ. Dropshipping page says 1–3 business days; product page 1–5 (conflict); shipping cost and B2B SKU costs not public.
- B2B returns: 14 days for unused/unassembled goods in original packaging; buyer pays return freight. Complaints response up to 14 business days.
- Website has placeholder US address/demo items; Polish company details appear in contact/returns page. Verify website/terms before account.
- Official: https://byecohurt.pl/dropshipping-paneli-3d/ ; https://byecohurt.pl/refund_returns/

### CARO Group — CONDITIONAL (direct manufacturer)
- Wall decor: canvas prints, wallpapers, screens, clocks, posters; >30,000 designs; one-piece dropshipping, B2B account and agreement; dispatch stated within 48 h, worldwide shipping, recycled packaging.
- No public SKU costs, shipping rates, returns, fees, VAT or integration/sync details. Catalogue overlaps Artgeist/Bimago/Decostores; only consider if SKU or terms are materially better.
- Official: https://carogroup.eu/dropshipping/

All four new supplier records saved in Notion. None counted as confirmed fully qualified partners. No accounts, emails, contracts or orders.

## Launch blockers (P0)
1. 0 active and 0 published products.
2. 134 first-import products all inventory 0; stock feed must be checked.
3. Missing supplier shipping cost, weights, VAT/invoice basis, fees and return terms; margin 30% remains HOLD.
4. Store password enabled and checkout/payment readiness requires owner confirmation.
5. Twelve Polish supplier imports via Base Connect planned 1–2 Dec; validate data before selecting SKU.

## Actions / approvals
- Z17 created: read-only audit of inventory sync and Online Store publication after 12-supplier import; owner Agent operacyjny (Claude), P0. Do not activate/publish or change prices.
- Owner approval required for: confirmation of Hertwill/Syncee app removal; SKU selection; activation/publication; password removal and checkout test; business restart/VAT; Base Connect/own courier; ad accounts/budget.
- No ads or creative were prepared because no products are ACTIVE and published with verified stock.
- Gmail connector required interactive auth in this non-interactive run; supplier emails/attachments were not read and nothing was sent.
- GitHub repository was accessible after correcting owner spelling. Files saved on work/giovetta-foundation; no merge to main, no code changes.

## Next
- 27 Nov: further targeted supplier research and cost gaps.
- 1–2 Dec: 12 Polish supplier import planned.
- 2–3 Dec: inventory/stock, duplicate, product data, cost and publication audit.
- 4 Dec: soft launch only if owner approval, verified stock, checkout and >=30% contribution margin for selected SKU.

## Notion
- Daily report (append to Claude-agent report): https://app.notion.com/p/424241ec5e7381789dc3d521cbe7ef2e
- Product review: https://app.notion.com/p/424241ec5e738182b5c9c671d51045db
- Z17: https://app.notion.com/p/424241ec5e7381b4a214d532b1a5cce0
- Supplier database: https://app.notion.com/p/0b8ecb9c6c3e4f41809edee513d4d9a5

No Shopify changes, campaigns, purchases, supplier messages or agreements were made.
