import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/server/app'
import type { CoreClient } from '../../src/server/core-client'
import { testConfig } from '../helpers'

const okCore: CoreClient = {
  ingest: async () => ({ messages: [], conversation_id: 'c1' }),
  history: async () => ({ items: [], total: 0 }),
}

describe('security', () => {
  it('refuses a non-allowlisted Origin on /chat', async () => {
    const app = createApp({ config: testConfig({ allowedOrigins: ['https://good.com'] }), core: okCore })
    const res = await request(app)
      .post('/chat')
      .set('Origin', 'https://evil.com')
      .send({ visitor: 'v', type: 'text', text: 'x' })
    expect(res.status).toBe(403)
  })

  it('allows an allowlisted Origin and sets CORS', async () => {
    const app = createApp({ config: testConfig({ allowedOrigins: ['https://good.com'] }), core: okCore })
    const res = await request(app)
      .post('/chat')
      .set('Origin', 'https://good.com')
      .send({ visitor: 'v', type: 'text', text: 'x' })
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe('https://good.com')
  })

  it('rate-limits a flood from one visitor', async () => {
    const app = createApp({ config: testConfig({ rateLimitMax: 2 }), core: okCore })
    const send = () => request(app).post('/chat').send({ visitor: 'flood', type: 'text', text: 'x' })
    await send()
    await send()
    expect((await send()).status).toBe(429)
  })

  it('rejects /send without the internal key when set', async () => {
    const app = createApp({ config: testConfig({ internalApiKey: 'secret' }) })
    const res = await request(app)
      .post('/send')
      .send({ contact: { external_id: 'v' }, message: { type: 'text', text: 'x' } })
    expect(res.status).toBe(401)
  })

  it('accepts /send with the internal key', async () => {
    const app = createApp({ config: testConfig({ internalApiKey: 'secret' }) })
    const res = await request(app)
      .post('/send')
      .set('X-Internal-API-Key', 'secret')
      .send({ contact: { external_id: 'v' }, message: { type: 'text', text: 'x' } })
    expect(res.status).toBe(200)
  })
})
