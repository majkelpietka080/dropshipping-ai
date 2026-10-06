import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OAuthStateStore,
  checkRedirectUri,
  clearStateCookie,
  readCookie,
  stateCookie
} from '../src/allegro-oauth.js';

test('OAuth state is single-use and must match the browser cookie', () => {
  const store = new OAuthStateStore();
  const state = store.create();

  assert.equal(store.consume(state, 'other'), false);
  // A mismatched attempt does not burn the state for the legitimate browser...
  const fresh = store.create();
  assert.equal(store.consume(fresh, fresh), true);
  // ...but a consumed state cannot be replayed.
  assert.equal(store.consume(fresh, fresh), false);
});

test('missing or unknown OAuth state is rejected', () => {
  const store = new OAuthStateStore();

  assert.equal(store.consume(undefined, undefined), false);
  assert.equal(store.consume('forged', 'forged'), false);
});

test('OAuth state expires', () => {
  let now = 1_000;
  const store = new OAuthStateStore(1_000, () => now);
  const state = store.create();

  now += 1_001;
  assert.equal(store.consume(state, state), false);
});

test('state cookie is HttpOnly, scoped and cleared after use', () => {
  const cookie = stateCookie('abc', false);

  assert.match(cookie, /^allegro_oauth_state=abc;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\/allegro\/oauth/);
  assert.doesNotMatch(cookie, /Secure/);
  assert.match(stateCookie('abc', true), /Secure/);
  assert.match(clearStateCookie(false), /Max-Age=0/);
  assert.equal(readCookie('a=1; allegro_oauth_state=xyz; b=2', 'allegro_oauth_state'), 'xyz');
  assert.equal(readCookie(undefined, 'allegro_oauth_state'), undefined);
});

test('redirect URI must point to this API callback', () => {
  assert.equal(checkRedirectUri('http://localhost:3001/allegro/oauth/callback', 3001), null);
  assert.equal(checkRedirectUri('https://api.example.com/allegro/oauth/callback', 3001), null);
  assert.match(checkRedirectUri('http://localhost:3000/allegro/oauth/callback', 3001)!, /portu 3000/);
  assert.match(checkRedirectUri('http://localhost:3001/callback', 3001)!, /ścieżkę/);
  assert.match(checkRedirectUri('nope', 3001)!, /poprawnym URL/);
});
