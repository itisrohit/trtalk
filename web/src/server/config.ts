/** Gateway configuration, read from the environment (ADR-011 §5). */
export interface Config {
  port: number
  /** The core's base URL, e.g. http://localhost:8090 */
  coreUrl: string
  /** Shared secret with the core. Null = open (local dev), mirrors the core. */
  internalApiKey: string | null
  /** Origins allowed to embed the widget. '*' = any (dev only). */
  allowedOrigins: string[]
  rateLimitWindowMs: number
  rateLimitMax: number
  /** Shown to the visitor when the core is unreachable (gateway-local, EN default). */
  errorReply: string
  unsupportedReply: string
  /** How many past messages to rehydrate on open. */
  historyLimit: number
}

/** The canonical channel name this gateway speaks. */
export const CHANNEL = 'web' as const

function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 8002),
    coreUrl: (env.CORE_URL ?? 'http://localhost:8090').replace(/\/$/, ''),
    internalApiKey: env.INTERNAL_API_KEY || null,
    allowedOrigins: csv(env.WEB_ALLOWED_ORIGINS) || [],
    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    rateLimitMax: Number(env.RATE_LIMIT_MAX ?? 30),
    errorReply:
      env.ERROR_REPLY ?? 'Sorry, something went wrong. Please try again in a moment.',
    unsupportedReply:
      env.UNSUPPORTED_REPLY ?? "Sorry, I can't handle that kind of message here.",
    historyLimit: Number(env.HISTORY_LIMIT ?? 50),
  }
}
