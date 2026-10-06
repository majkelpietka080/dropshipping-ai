import type { FastifyInstance } from 'fastify';
import {
  ALLEGRO_STATE_COOKIE,
  clearStateCookie,
  readCookie,
  stateCookie,
  type OAuthStateStore
} from '../allegro-oauth.js';
import { sendUpstreamError } from '../http-helpers.js';

export type AllegroRouteDependencies = {
  // Process-wide state store created once in app.ts; start and callback must share it.
  allegroStates: OAuthStateStore;
  isSecureCookie: boolean;
};

export function registerAllegroRoutes(
  app: FastifyInstance,
  { allegroStates, isSecureCookie }: AllegroRouteDependencies
) {
  app.get('/allegro/oauth/start', async (_request, reply) => {
    const clientId = process.env.ALLEGRO_CLIENT_ID;
    const redirectUri = process.env.ALLEGRO_REDIRECT_URI;
    const authBaseUrl =
      process.env.ALLEGRO_AUTH_BASE_URL ??
      'https://allegro.pl.allegrosandbox.pl';

    if (!clientId || !redirectUri) {
      return reply.code(500).send({
        error: 'Allegro OAuth is not configured'
      });
    }

    const authorizationUrl = new URL(
      '/auth/oauth/authorize',
      authBaseUrl
    );

    const state = allegroStates.create();

    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('state', state);

    reply.header('Set-Cookie', stateCookie(state, isSecureCookie));
    return reply.redirect(authorizationUrl.toString());
  });
  app.get('/allegro/oauth/callback', async (request, reply) => {
    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    const stateIsValid = allegroStates.consume(
      query.state,
      readCookie(request.headers.cookie, ALLEGRO_STATE_COOKIE)
    );

    reply.header('Set-Cookie', clearStateCookie(isSecureCookie));

    if (!stateIsValid) {
      return reply.code(400).send({
        error: 'Invalid or expired OAuth state. Start again from /allegro/oauth/start.'
      });
    }

    if (query.error) {
      return reply.code(400).send({
        error: query.error,
        error_description: query.error_description
      });
    }

    if (!query.code) {
      return reply.code(400).send({
        error: 'Missing Allegro authorization code'
      });
    }

    const clientId = process.env.ALLEGRO_CLIENT_ID;
    const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;
    const redirectUri = process.env.ALLEGRO_REDIRECT_URI;
    const authBaseUrl =
      process.env.ALLEGRO_AUTH_BASE_URL ??
      'https://allegro.pl.allegrosandbox.pl';

    if (!clientId || !clientSecret || !redirectUri) {
      return reply.code(500).send({
        error: 'Allegro OAuth is not configured'
      });
    }

    const credentials = Buffer.from(
      `${clientId}:${clientSecret}`
    ).toString('base64');

    let tokenResponse: Response;
    let tokenData: {
      token_type?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    try {
      tokenResponse = await fetch(
        new URL('/auth/oauth/token', authBaseUrl),
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: query.code,
            redirect_uri: redirectUri
          }),
          signal: AbortSignal.timeout(15_000)
        }
      );

      tokenData = await tokenResponse.json().catch(() => ({}));
    } catch (error) {
      return sendUpstreamError(request, reply, 'Allegro token exchange failed', error);
    }

    if (!tokenResponse.ok) {
      // Only Allegro's error code/description are forwarded, never the raw body.
      return reply.code(502).send({
        error: 'Allegro token exchange failed',
        upstreamStatus: tokenResponse.status,
        details: {
          error: tokenData.error,
          error_description: tokenData.error_description
        }
      });
    }

    return reply.send({
      ok: true,
      message: 'Allegro authorization successful',
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in
    });
  });
}
