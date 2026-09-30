const SENSITIVE_KEYS = new Set([
  'accesstoken',
  'apikey',
  'authorization',
  'cookie',
  'credential',
  'credentials',
  'jwt',
  'password',
  'proxyauthorization',
  'refreshtoken',
  'secret',
  'setcookie',
  'token',
])

const SAFE_HEADER_NAMES = ['accept', 'content-length', 'content-type', 'user-agent'] as const

export const REQUEST_LOG_REDACT_PATHS = [
  'authorization',
  'cookie',
  'password',
  'token',
  '*.authorization',
  '*.cookie',
  '*.password',
  '*.token',
  '*.headers.authorization',
  '*.headers.cookie',
  '*.query.token',
  '*.body.password',
  'headers.authorization',
  'headers.cookie',
  'query.token',
  'body.password',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.query.token',
  'req.body.password',
] as const

export const REQUEST_LOG_CENSOR = '(redacted)'

export type RequestLogSource = {
  id?: string
  method?: string
  url?: string
  ip?: string
  hostname?: string
  params?: unknown
  query?: unknown
  headers?: unknown
  body?: unknown
  routeOptions?: { url?: string }
  raw?: { url?: string }
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function isSensitiveLogKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalizeKey(key))
}

export function redactSensitiveFields(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item, seen))
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  if (seen.has(value)) {
    return '[Circular]'
  }

  seen.add(value)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      isSensitiveLogKey(key) ? REQUEST_LOG_CENSOR : redactSensitiveFields(entryValue, seen),
    ]),
  )
}

export function redactRequestUrl(url: string): string {
  const queryIndex = url.indexOf('?')
  if (queryIndex === -1) {
    return url
  }

  const path = url.slice(0, queryIndex)
  const params = new URLSearchParams(url.slice(queryIndex + 1))
  const query = [...params.entries()]
    .map(([key, value]) => `${encodeURIComponent(key)}=${isSensitiveLogKey(key) ? REQUEST_LOG_CENSOR : encodeURIComponent(value)}`)
    .join('&')
  return query.length > 0 ? `${path}?${query}` : path
}

function safeHeaders(headers: unknown): Record<string, unknown> {
  if (headers === null || typeof headers !== 'object' || Array.isArray(headers)) {
    return {}
  }

  const source = headers as Record<string, unknown>
  return Object.fromEntries(
    SAFE_HEADER_NAMES
      .filter((name) => source[name] !== undefined)
      .map((name) => [name, source[name]]),
  )
}

function safeBody(body: unknown): unknown {
  if (body === undefined) {
    return undefined
  }

  if (typeof body === 'string' || body instanceof Uint8Array) {
    return { omitted: true, byteLength: body.length }
  }

  return redactSensitiveFields(body)
}

/** Returns request diagnostics that are safe to write at debug level. */
export function buildSafeRequestLog(request: RequestLogSource): Record<string, unknown> {
  const url = request.url ?? request.raw?.url ?? ''
  return {
    requestId: request.id,
    method: request.method,
    url: redactRequestUrl(url),
    route: request.routeOptions?.url,
    params: redactSensitiveFields(request.params),
    query: redactSensitiveFields(request.query),
    headers: safeHeaders(request.headers),
    body: safeBody(request.body),
  }
}

/** Serializer used by Fastify's automatic request logs. */
export function serializeLoggedRequest(request: RequestLogSource): Record<string, unknown> {
  return {
    method: request.method,
    url: redactRequestUrl(request.url ?? request.raw?.url ?? ''),
    hostname: request.hostname,
    remoteAddress: request.ip,
  }
}
