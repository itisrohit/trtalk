import { CHANNEL } from './config'

/** What the widget sends the gateway. Media rides as a base64 data: URI. */
export interface WidgetMessage {
  type: 'text' | 'image' | 'audio'
  text?: string | null
  media?: { mime: string; dataUri: string } | null
}

/** The canonical inbound the core expects (ARCHITECTURE §5). */
export interface CanonicalInbound {
  channel: typeof CHANNEL
  contact: { external_id: string; display_name: string | null; metadata: Record<string, unknown> }
  message: { type: string; text: string | null; media_url: string | null }
  received_at: string
}

/**
 * Translate a widget message into the canonical contract. The visitor UUID is
 * the channel-scoped external_id (ADR-011 §2); name/email is a prompt concern,
 * never the channel's.
 */
export function toCanonicalInbound(
  visitorId: string,
  msg: WidgetMessage,
  now: string = new Date().toISOString(),
): CanonicalInbound {
  return {
    channel: CHANNEL,
    contact: { external_id: visitorId, display_name: null, metadata: {} },
    message: {
      type: msg.type,
      text: msg.text ?? null,
      media_url: msg.media?.dataUri ?? null,
    },
    received_at: now,
  }
}
