import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/server/app'

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(createApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})
