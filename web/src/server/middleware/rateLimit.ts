import type { NextFunction, Request, Response } from 'express'
import type { Config } from '../config'

/**
 * A tiny in-memory fixed-window rate limiter keyed per visitor/IP (ADR-011 §5).
 * Bounds abuse of the public endpoints without user auth. In-memory ⇒ per
 * replica; good enough for the MVP (see the SSE-map scaling note).
 */
export function rateLimit(cfg: Config, keyFn: (req: Request) => string) {
  const hits = new Map<string, { count: number; resetAt: number }>()

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn(req)
    const now = Date.now()
    const rec = hits.get(key)

    if (!rec || now > rec.resetAt) {
      hits.set(key, { count: 1, resetAt: now + cfg.rateLimitWindowMs })
      next()
      return
    }
    if (rec.count >= cfg.rateLimitMax) {
      res.status(429).json({ error: 'rate limit exceeded' })
      return
    }
    rec.count++
    next()
  }
}
