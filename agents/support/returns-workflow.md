# Giovetta Living — return and complaint operations

This document is the operating reference for the returns agent and later API implementation. It is not a substitute for legal review or current supplier terms.

## Store responsibility

- Retail seller: Cosy Flat Michał Piętka, brand Giovetta Living.
- Customer contact: majkel.pietka@gmail.com.
- No own warehouse is assumed. The store coordinates the return route with the supplier or an approved third-party return address.
- A customer starts a return/complaint with Giovetta Living. Do not tell the customer to resolve it with the wholesaler.
- Supplier terms do not automatically limit customer statutory rights against the store.

## Supplier matrix

| Supplier | Voluntary upstream process | Important exception | Operational rule |
|---|---|---|---|
| Eight Gate | Follow current B2B terms and get written instructions | B2B terms shown on the official page on 2026-10-29 were version 1.0 effective 2026-11-01; that version says no returns directly from end customers and reserves the right to refuse unapproved parcels | Re-check the terms effective for the supplier order, then obtain case-specific written authorization/route before any customer sends the product |
| Hertwill | Most eligible products: 30-day period from the original supplier order; unused/undamaged, original labels; create label from Orders view or contact support | Product/brand exclusions apply; return postage and destination vary | Check the current order-specific label/terms; never treat supplier voluntary-return exclusions as ending consumer statutory rights |
| Other/unknown | Not yet verified | Do not assume return label, free shipping, address or acceptance | Hold customer shipping instruction until current terms and a route are confirmed |

## Eight Gate operational handling

Official sources:
- B2B terms: https://eightgate.pl/dokumenty/regulamin-sprzedazy-b2b/
- Platform terms: https://eightgate.pl/dokumenty/regulamin-platformy/
- Orders/integration: kontakt@eightgate.pl
- Complaints: reklamacje@eightgate.pl
- Published warehouse address in Eight Gate terms: ul. Wąska 2, 05-126 Rembelszczyzna — **not an automatic customer return address**.

For the version shown as effective 2026-11-01:
- A B2B report for a damaged, incomplete, incorrect, or nonfunctional product is due within 3 business days of delivery and should include the order number, description, photos of product/packaging/carrier label, and video if nonfunctional.
- Eight Gate may request more information or return of the product at Eight Gate's expense.
- The supplier's remedy to the B2B reseller and the reseller's remedy to the consumer are separate.
- An unapproved direct consumer return may be refused. If a parcel nonetheless arrives, follow the exact storage and forwarding clauses in the version governing that wholesale order; do not assume that the supplier has accepted the return or refunded the store.
- The B2B policy also makes the store responsible for consumer-facing withdrawal, complaint and return-address information. Do not give supplier contact details to the customer as a replacement for store support.

## Human approval required

Use an approval queue for:
- refund, partial refund, compensation or goodwill;
- cancellation of a paid supplier order, replacement shipment, or paid return label;
- any case that has no confirmed physical return route;
- legal threat, chargeback, safety/injury, recall, fraud indicator, or an exceptional cost;
- any request to publish or change the public store policy.

Routine work the agent may prepare:
- identify order and supplier;
- draft a first-response acknowledgment;
- collect photos/order details necessary for the complaint;
- prepare supplier inquiries using minimal necessary customer data;
- track the case and prepare customer updates;
- send only those routine messages that are covered by a separately configured, explicitly approved messaging policy.

## Case record fields

- Case ID and Shopify order number
- customer contact and minimum necessary case data
- order/delivery date, product/variant, supplier, SKU
- classification and statutory deadline
- current official supplier terms URL/version/effective date and date checked
- supplier reference, case status, contact timestamp
- approved return address/label, carrier, payer and deadline
- tracking, receipt/inspection, supplier outcome
- customer-side refund/replacement status and approval reference
- next action/date, escalation reason, closure date

## Sources checked 2026-10-29

- Eight Gate B2B terms: https://eightgate.pl/dokumenty/regulamin-sprzedazy-b2b/
- Eight Gate platform terms: https://eightgate.pl/dokumenty/regulamin-platformy/
- Hertwill returns: https://hertwill.com/resources/returns-refunds
- Hertwill terms: https://hertwill.com/resources/terms-of-service

Re-check sources at the start of each case. Supplier websites, return policies, and term versions can change.
