import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { assertAuthConfiguration, isProductionRuntime } from './lib/auth-session';
import { isGovernedDeepSeekConfigured } from './lib/ai/model-gateway/service';

const productionRuntime = isProductionRuntime();
const dev = !productionRuntime;
const modelConfigured = isGovernedDeepSeekConfigured();
console.log(modelConfigured
  ? '[startup] DeepSeek credentials and HTTPS endpoint configured; tenant route and live probe are still required for model readiness.'
  : '[startup] DeepSeek not configured; White Ze is running in basic-rule mode. No model availability is advertised.');

try {
  assertAuthConfiguration();
} catch (error) {
  console.error('[startup] AUTH_SECRET validation failed:', error instanceof Error ? error.message : error);
  // Refuse to expose a production login endpoint without a valid signing secret.
  if (productionRuntime) process.exit(1);
}
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, hostname, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${productionRuntime ? 'production' : 'development'} (NODE_ENV=${process.env.NODE_ENV ?? 'unset'}, COZE_PROJECT_ENV=${process.env.COZE_PROJECT_ENV ?? 'unset'})`,
    );
    if (productionRuntime && process.env.NODE_ENV !== 'production') {
      console.warn('[startup] Production runtime detected through COZE_PROJECT_ENV; set NODE_ENV=production in deployment configuration.');
    }
  });
});
