import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function readJson(path, fallback = undefined) {
  if (!path || !existsSync(path)) {
    if (fallback !== undefined) return fallback
    throw new Error(`File not found: ${path}`)
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

/** Append `key=value` pairs to the file GitHub Actions reads step outputs from. */
export function writeGithubOutputs(file, outputs) {
  if (!file) return
  const lines = Object.entries(outputs).map(([key, value]) => {
    const text = String(value ?? '')
    if (!text.includes('\n')) return `${key}=${text}`
    const delimiter = `EOF_${Math.random().toString(36).slice(2)}`
    return `${key}<<${delimiter}\n${text}\n${delimiter}`
  })
  appendFileSync(file, `${lines.join('\n')}\n`)
}
