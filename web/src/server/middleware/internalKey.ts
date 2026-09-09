import type { NextFunction, Request, Response } from 'express'
import type { Config } from '../config'

/**
 * Verify the shared secret on the internal /send route (core → gateway).
 * No-op when the key is unset (local dev), mirroring the core's own posture.
 * The key lives ONLY here on the server — never in the browser (ADR-011 §5).
 */
export function requireInternalKey(cfg: Config) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!cfg.internalApiKey) {
      next()
      return
    }
    if (req.header('x-internal-api-key') !== cfg.internalApiKey) {
      res.status(401).json({ error: 'invalid internal api key' })
      return
    }
    next()
  }
}
