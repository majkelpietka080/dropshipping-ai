# Dropshipping AI

AI operator for a Shopify dropshipping store in the EU.

## Stack
- Shopify
- Claude as AI decision layer
- Node.js + TypeScript
- PostgreSQL
- Approval queue for important business actions
- GitHub for source control and CI/CD

## Architecture
Shopify -> Webhooks -> API/Worker -> AI Agents -> Approval Queue -> Shopify/Supplier

Secrets must never be committed to the repository.
