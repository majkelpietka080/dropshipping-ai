import './env.js';

import { app, corsOrigins } from './app.js';
import { checkRedirectUri } from './allegro-oauth.js';
import { getAdminToken } from './security.js';

const port = Number(process.env.APP_PORT ?? 3000);
const host = process.env.APP_HOST ?? '0.0.0.0';

if (!getAdminToken()) {
  app.log.warn('APPROVAL_SECRET is not set (min. 16 chars); admin endpoints respond with 503.');
}

if (process.env.ALLEGRO_REDIRECT_URI) {
  const redirectProblem = checkRedirectUri(process.env.ALLEGRO_REDIRECT_URI, port);

  if (redirectProblem) {
    app.log.warn(redirectProblem);
  }
}

app.log.info({ corsOrigins: Array.from(corsOrigins) }, 'CORS allowed origins');

await app.listen({ port, host });
