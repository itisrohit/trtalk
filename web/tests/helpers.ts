import type { Config } from '../src/server/config'

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    coreUrl: 'http://core.test',
    internalApiKey: null,
    allowedOrigins: ['*'],
    rateLimitWindowMs: 60_000,
    rateLimitMax: 30,
    errorReply: 'ERR',
    unsupportedReply: 'UNSUP',
    historyLimit: 50,
    ...overrides,
  }
}
