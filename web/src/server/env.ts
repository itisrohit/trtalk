import { readFileSync } from 'node:fs'

/** Parse KEY=VALUE lines (blank lines and # comments ignored; first '=' splits). */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

/**
 * Load `.env` into process.env for local dev — the real environment always
 * wins (mirrors pydantic-settings in the Python gateways). Missing file is
 * fine: Docker/Kamal inject the environment directly.
 */
export function loadDotenv(path = '.env', env: NodeJS.ProcessEnv = process.env): void {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return
  }
  for (const [key, value] of Object.entries(parseDotenv(text))) {
    if (env[key] === undefined) env[key] = value
  }
}
