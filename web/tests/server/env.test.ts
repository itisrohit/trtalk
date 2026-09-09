import { describe, expect, it } from 'vitest'
import { parseDotenv, loadDotenv } from '../../src/server/env'

describe('parseDotenv', () => {
  it('parses KEY=VALUE, skipping comments and blanks', () => {
    const text = [
      '# a comment',
      '',
      'PORT=8002',
      'ERROR_REPLY=Sorry, something went wrong. Please try again.',
      'WEB_ALLOWED_ORIGINS=http://a.com,http://b.com',
      'BROKEN LINE WITHOUT EQUALS',
    ].join('\n')
    expect(parseDotenv(text)).toEqual({
      PORT: '8002',
      ERROR_REPLY: 'Sorry, something went wrong. Please try again.',
      WEB_ALLOWED_ORIGINS: 'http://a.com,http://b.com',
    })
  })

  it('splits on the first = only', () => {
    expect(parseDotenv('CORE_URL=http://localhost:8090?x=1')).toEqual({
      CORE_URL: 'http://localhost:8090?x=1',
    })
  })
})

describe('loadDotenv', () => {
  it('is a no-op when the file is missing (Docker/Kamal inject env directly)', () => {
    const env: NodeJS.ProcessEnv = {}
    loadDotenv('/nonexistent/.env', env)
    expect(env).toEqual({})
  })

  it('never overrides the real environment', () => {
    const env: NodeJS.ProcessEnv = { PORT: '9999' }
    // parse-only behavior is covered above; here we exercise the merge rule
    // through a real temp file via the repo's own .env.example.
    loadDotenv('.env.example', env)
    expect(env.PORT).toBe('9999')
    expect(env.CORE_URL).toBe('http://localhost:8090')
  })
})
