import type { Request, Response } from 'express'
import type { StreamRegistry } from '../streams'

const HEARTBEAT_MS = 15_000

/**
 * GET /stream?visitor=<uuid> — the live outbound SSE (ADR-011 §3). Opened on
 * widget mount and kept open across the deferred turn so the reply can land.
 */
export function streamRoute(registry: StreamRegistry) {
  return (req: Request, res: Response) => {
    const visitor = String(req.query.visitor ?? '')
    if (!visitor) {
      res.status(400).end()
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // don't let nginx buffer the stream
    })
    res.write(': connected\n\n')

    const remove = registry.add(visitor, res)
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)

    req.on('close', () => {
      clearInterval(heartbeat)
      remove()
    })
  }
}
