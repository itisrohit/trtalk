// Locale key-parity guard: every key must exist in BOTH languages.
// A key missing in one locale would silently render its raw path in the UI —
// this test makes that a build failure instead.
import { describe, expect, it } from "vitest"
import en from "./en.json"
import es from "./es.json"

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === "object") {
      return flattenKeys(value as Record<string, unknown>, path)
    }
    return [path]
  })
}

describe("locales", () => {
  it("en and es have identical key sets", () => {
    const enKeys = flattenKeys(en).sort()
    const esKeys = flattenKeys(es).sort()
    expect(enKeys).toEqual(esKeys)
  })

  it("no value is empty", () => {
    for (const locale of [en, es]) {
      for (const key of flattenKeys(locale)) {
        const value = key
          .split(".")
          .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], locale)
        expect(value, `empty value for ${key}`).not.toBe("")
      }
    }
  })

  it("interpolation placeholders match between locales", () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()

    const lookup = (locale: Record<string, unknown>, key: string) =>
      key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], locale)

    for (const key of flattenKeys(en)) {
      const enValue = lookup(en, key)
      const esValue = lookup(es, key)
      if (typeof enValue === "string" && typeof esValue === "string") {
        expect(placeholders(esValue), `placeholders differ for ${key}`).toEqual(
          placeholders(enValue)
        )
      }
    }
  })
})
