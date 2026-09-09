import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/server/app'
import type { CoreClient } from '../../src/server/core-client'
import { testConfig } from '../helpers'

function fakeCore(over: Partial<CoreClient> = {}): CoreClient {
  return {
    ingest: vi.fn(async () => ({ messages: [], conversation_id: 'c1' })),
    history: vi.fn(async () => ({ items: [], total: 0 })),
    ...over,
  }
}

describe('POST /chat', () => {
  it('relays a canonical inbound (channel web, external_id, media data uri)', async () => {
    const core = fakeCore()
    const app = createApp({ config: testConfig(), core })

    const res = await request(app).post('/chat').send({
      visitor: 'v-123',
      type: 'image',
      text: 'look',
      media: { mime: 'image/png', dataUri: 'data:image/png;base64,AAA' },
    })

    expect(res.status).toBe(200)
    expect(core.ingest).toHaveBeenCalledOnce()
    const payload = vi.mocked(core.ingest).mock.calls[0][0]
    expect(payload.channel).toBe('web')
    expect(payload.contact.external_id).toBe('v-123')
    expect(payload.message.type).toBe('image')
    expect(payload.message.media_url).toBe('data:image/png;base64,AAA')
  })

  it('returns 400 without visitor/type', async () => {
    const app = createApp({ config: testConfig(), core: fakeCore() })
    expect((await request(app).post('/chat').send({ type: 'text' })).status).toBe(400)
  })

  it('returns 502 with the gateway error reply when the core is down', async () => {
    const core = fakeCore({
      ingest: vi.fn(async () => {
        throw new Error('core down')
      }),
    })
    const app = createApp({ config: testConfig({ errorReply: 'sorry!' }), core })

    const res = await request(app).post('/chat').send({ visitor: 'v', type: 'text', text: 'hi' })
    expect(res.status).toBe(502)
    expect(res.body.messages[0].text).toBe('sorry!')
  })
})
