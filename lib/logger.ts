// ─── Structured logger ────────────────────────────────────────────────────────
// Consistent log format across all server-side code.
// In production swap the console calls for your logging provider (Axiom, Datadog, etc.)

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  ts:      string
  level:   LogLevel
  module:  string
  msg:     string
  data?:   Record<string, unknown>
  traceId?: string
}

const IS_PROD = process.env.NODE_ENV === 'production'

function emit(entry: LogEntry): void {
  const line = JSON.stringify(entry)
  if (entry.level === 'error') return void console.error(line)
  if (entry.level === 'warn')  return void console.warn(line)
  if (IS_PROD && entry.level === 'debug') return  // suppress debug in prod
  console.log(line)
}

export function createLogger(module: string) {
  const log = (level: LogLevel, msg: string, data?: Record<string, unknown>, traceId?: string) =>
    emit({ ts: new Date().toISOString(), level, module, msg, data, traceId })

  return {
    debug: (msg: string, data?: Record<string, unknown>, traceId?: string) => log('debug', msg, data, traceId),
    info:  (msg: string, data?: Record<string, unknown>, traceId?: string) => log('info',  msg, data, traceId),
    warn:  (msg: string, data?: Record<string, unknown>, traceId?: string) => log('warn',  msg, data, traceId),
    error: (msg: string, data?: Record<string, unknown>, traceId?: string) => log('error', msg, data, traceId),
  }
}

// ─── Request trace ID ─────────────────────────────────────────────────────────
export function getTraceId(req: Request): string {
  return (
    req.headers.get('x-trace-id') ??
    req.headers.get('x-request-id') ??
    `forge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  )
}
