import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type Express, type Request } from 'express'
import { loadConfig, type Config } from './config'
import { createCoreClient, type CoreClient } from './core-client'
import { createStreamRegistry, type StreamRegistry } from './streams'
import { originAllowlist } from './middleware/origin'
import { rateLimit } from './middleware/rateLimit'
import { requireInternalKey } from './middleware/internalKey'
import { chatRoute } from './routes/chat'
import { streamRoute } from './routes/stream'
import { sendRoute } from './routes/send'
import { historyRoute } from './routes/history'

const HERE = dirname(fileURLToPath(import.meta.url)) // src/server
const REPO_ROOT = resolve(HERE, '..', '..')

/** Injectable for tests; production builds them from the environment. */
export interface AppDeps {
  config?: Config
  core?: CoreClient
  registry?: StreamRegistry
}

export function createApp(deps: AppDeps = {}): Express {
  const cfg = deps.config ?? loadConfig()
  const core = deps.core ?? createCoreClient(cfg)
  const registry = deps.registry ?? createStreamRegistry()

  const app = express()
  // Media rides inbound as a base64 data: URI (ADR-003) — allow a large body.
  app.use(express.json({ limit: '30mb' }))

  const guard = originAllowlist(cfg)
  const byVisitor = (req: Request) => String(req.body?.visitor ?? req.ip ?? 'anon')
  const byVisitorQuery = (req: Request) => String(req.query.visitor ?? req.ip ?? 'anon')

  // Public browser-facing routes: origin allowlist (+ CORS) and rate limit.
  app.options('*', guard)
  app.post('/chat', guard, rateLimit(cfg, byVisitor), chatRoute(cfg, core))
  app.get('/stream', guard, streamRoute(registry))
  app.get('/history', guard, rateLimit(cfg, byVisitorQuery), historyRoute(cfg, core))

  // Internal: the core's deferred reply. Shared secret, NOT origin-checked.
  app.post('/send', requireInternalKey(cfg), sendRoute(registry))

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'trtalk-web' }))

  // The built widget + the demo harness (dev/QA fixture).
  app.get('/widget.js', (_req, res) => {
    res.sendFile(resolve(REPO_ROOT, 'dist', 'widget.js'), (err) => {
      if (err) res.status(404).type('text/plain').send('// widget not built — run `npm run build`')
    })
  })
  // extensions: '/demo' resolves to demo.html (the documented QA URL).
  app.use(express.static(resolve(REPO_ROOT, 'public'), { extensions: ['html'] }))

  return app
}
