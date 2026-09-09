import { describe, expect, it } from 'vitest'
import { getVisitorId } from '../../src/widget/visitor'

describe('visitor identity', () => {
  it('mints a UUID once and persists it (ADR-011 §2)', () => {
    localStorage.clear()
    const a = getVisitorId()
    const b = getVisitorId()
    expect(a).toBe(b)
    expect(localStorage.getItem('trtalk_web_visitor')).toBe(a)
  })
})
