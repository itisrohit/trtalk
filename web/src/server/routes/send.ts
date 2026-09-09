import type { Request, Response } from 'express'
import type { StreamRegistry } from '../streams'

/**
 * POST /send — the core's deferred reply (ADR-004/008), core → gateway. Look up
 * the visitor's live stream(s) and push the message down. Returns 200 even when
 * no stream is open: the message is persisted in the core, so rehydration on the
 * next open will show it (ADR-011 §3). Internal-key protected, not origin-checked.
 */
export function sendRoute(registry: StreamRegistry) {
  return (req: Request, res: Response) => {
    const { contact, message } = (req.body ?? {}) as {
      contact?: { external_id?: string }
      message?: unknown
    }
    const externalId = contact?.external_id

    if (!externalId || !message) {
      res.status(400).json({ error: 'contact.external_id and message are required' })
      return
    }

    const delivered = registry.push(externalId, 'message', message)
    res.json({ status: 'sent', message_id: null, delivered })
  }
}
