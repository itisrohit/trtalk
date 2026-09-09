import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/server/app'
import { createStreamRegistry } from '../../src/server/streams'
import { testConfig } from '../helpers'

describe('POST /send → SSE push', () => {
  it('pushes the message to a registered visitor stream', async () => {
    const registry = createStreamRegistry()
    const written: string[] = []
    registry.add('v-1', { write: (c) => written.push(c) })
    const app = createApp({ config: testConfig(), registry })

    const res = await request(app)
      .post('/send')
      .send({ contact: { external_id: 'v-1' }, message: { type: 'text', text: 'hello' } })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('sent')
    expect(res.body.delivered).toBe(1)
    const sse = written.join('')
    expect(sse).toContain('event: message')
    expect(sse).toContain('hello')
  })

  it('returns 200 delivered=0 when no stream is open (persisted; rehydrated later)', async () => {
    const app = createApp({ config: testConfig(), registry: createStreamRegistry() })
    const res = await request(app)
      .post('/send')
      .send({ contact: { external_id: 'nobody' }, message: { type: 'text', text: 'hi' } })
    expect(res.status).toBe(200)
    expect(res.body.delivered).toBe(0)
  })

  it('returns 400 without contact/message', async () => {
    const app = createApp({ config: testConfig() })
    expect((await request(app).post('/send').send({})).status).toBe(400)
  })
})
