import type { NextFunction, Request, Response } from 'express'
import type { Config } from '../config'

/**
 * Origin allowlist + CORS for the PUBLIC browser-facing routes (ADR-011 §5).
 * The widget runs on the customer's domain, so cross-origin requests carry an
 * Origin header — only configured origins pass. Requests with no Origin
 * (curl, same-origin, server-to-server) are allowed; '*' allows any (dev only).
 */
export function originAllowlist(cfg: Config) {
  const any = cfg.allowedOrigins.includes('*')

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header('origin')

    if (origin) {
      const allowed = any || cfg.allowedOrigins.includes(origin)
      if (!allowed) {
        res.status(403).json({ error: 'origin not allowed' })
        return
      }
      res.setHeader('Access-Control-Allow-Origin', any ? '*' : origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  }
}
