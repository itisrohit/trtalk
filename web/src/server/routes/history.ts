import type { Request, Response } from 'express'
import type { Config } from '../config'
import type { CoreClient } from '../core-client'

/**
 * GET /history?visitor=<uuid> — proxy the core's internal history read so the
 * browser never holds the internal key (ADR-011 §3). Used to rehydrate the chat
 * on (re)open, including replies delivered while the tab was closed.
 */
export function historyRoute(cfg: Config, core: CoreClient) {
  return async (req: Request, res: Response) => {
    const visitor = String(req.query.visitor ?? '')
    if (!visitor) {
      res.status(400).json({ error: 'visitor is required' })
      return
    }
    try {
      res.json(await core.history(visitor, cfg.historyLimit))
    } catch {
      res.json({ items: [], total: 0 }) // never break the widget on a read error
    }
  }
}
