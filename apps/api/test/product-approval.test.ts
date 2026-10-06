import test from 'node:test';
import assert from 'node:assert/strict';
import {
  InFlightGuard,
  approveProductProposal,
  toShopifyProductGid,
  type ApprovableProposal,
  type ApprovalSteps
} from '../src/product-approval.js';

function fakeSteps(overrides: Partial<ApprovalSteps> = {}) {
  const calls = { create: 0, price: 0, inventory: 0, persist: 0 };
  const steps: ApprovalSteps = {
    async createProduct() {
      calls.create++;
      return { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/2', raw: { product: { id: 'gid://shopify/Product/1' } } };
    },
    async setPrice() { calls.price++; return { ok: true }; },
    async setInventory() { calls.inventory++; return { ok: true }; },
    async persist() { calls.persist++; },
    ...overrides
  };
  return { steps, calls };
}

test('first approval creates the product, sets price and inventory', async () => {
  const proposal: ApprovableProposal = { status: 'pending', suggestedPrice: 49.99 };
  const { steps, calls } = fakeSteps();

  const outcome = await approveProductProposal(proposal, steps);

  assert.equal(outcome.reusedExistingProduct, false);
  assert.equal(proposal.status, 'approved');
  assert.equal(proposal.shopifyProductId, 'gid://shopify/Product/1');
  assert.ok(proposal.approvedAt);
  assert.deepEqual(calls, { create: 1, price: 1, inventory: 1, persist: 2 });
});

test('retry after a failed inventory step reuses the product instead of duplicating it', async () => {
  const proposal: ApprovableProposal = { status: 'pending', suggestedPrice: 10 };
  let failInventory = true;
  const { steps, calls } = fakeSteps({
    async setInventory() {
      if (failInventory) throw new Error('inventory down');
      return {};
    }
  });

  await assert.rejects(approveProductProposal(proposal, steps), /inventory down/);
  assert.equal(proposal.status, 'pending');
  assert.equal(proposal.shopifyProductId, 'gid://shopify/Product/1');

  failInventory = false;
  const outcome = await approveProductProposal(proposal, steps);

  assert.equal(outcome.reusedExistingProduct, true);
  assert.equal(calls.create, 1);
  assert.equal(proposal.status, 'approved');
});

test('product id is persisted before follow-up steps run', async () => {
  const proposal: ApprovableProposal = { status: 'pending', suggestedPrice: 10 };
  const persisted: Array<string | undefined> = [];
  const { steps } = fakeSteps({
    async persist() { persisted.push(proposal.shopifyProductId); },
    async setPrice() { throw new Error('price failed'); }
  });

  await assert.rejects(approveProductProposal(proposal, steps));
  assert.deepEqual(persisted, ['gid://shopify/Product/1']);
});

test('missing Shopify product id is an error and nothing is persisted', async () => {
  const proposal: ApprovableProposal = { status: 'pending' };
  const { steps, calls } = fakeSteps({
    async createProduct() { return { productId: '', raw: {} }; }
  });

  await assert.rejects(approveProductProposal(proposal, steps), /identyfikatora/);
  assert.equal(calls.persist, 0);
  assert.equal(proposal.status, 'pending');
});

test('price step is skipped without a suggested price', async () => {
  const { steps, calls } = fakeSteps();
  await approveProductProposal({ status: 'pending' }, steps);
  assert.equal(calls.price, 0);
});

test('in-flight guard rejects concurrent operations on the same id', () => {
  const guard = new InFlightGuard();

  assert.equal(guard.tryAcquire('a'), true);
  assert.equal(guard.tryAcquire('a'), false);
  assert.equal(guard.tryAcquire('b'), true);
  guard.release('a');
  assert.equal(guard.tryAcquire('a'), true);
});

test('Shopify product ids are validated', () => {
  assert.equal(toShopifyProductGid('123'), 'gid://shopify/Product/123');
  assert.equal(toShopifyProductGid('gid://shopify/Product/123'), 'gid://shopify/Product/123');
  assert.equal(toShopifyProductGid('123") { id } #'), null);
  assert.equal(toShopifyProductGid(undefined), null);
});
