import { describe, expect, it } from 'vitest'
import { createStreamRegistry } from '../../src/server/streams'

describe('stream registry', () => {
  it('adds, pushes to all, counts, and removes', () => {
    const reg = createStreamRegistry()
    const a: string[] = []
    const b: string[] = []
    const removeA = reg.add('v', { write: (c) => a.push(c) })
    reg.add('v', { write: (c) => b.push(c) })

    expect(reg.count('v')).toBe(2)
    expect(reg.push('v', 'message', { x: 1 })).toBe(2)
    expect(a.join('')).toContain('"x":1')
    expect(b.join('')).toContain('event: message')

    removeA()
    expect(reg.count('v')).toBe(1)
    expect(reg.push('unknown', 'message', {})).toBe(0)
  })
})
