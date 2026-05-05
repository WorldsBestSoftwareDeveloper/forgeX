// ─── Auth context provider ────────────────────────────────────────────────────
// Wraps the app so any component can access auth state + token via useAuthContext()
// Also provides apiCall() — a typed fetch wrapper that auto-attaches the JWT.

'use client'

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import { useAuth, type AuthState } from './useAuth'

// ─── API call helper ──────────────────────────────────────────────────────────

export interface ApiCallOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

export interface ApiCallResult<T> {
  data:   T | null
  error:  string | null
  status: number
}

type ApiCallFn = <T>(
  url: string,
  options?: ApiCallOptions
) => Promise<ApiCallResult<T>>

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue extends AuthState {
  apiCall: ApiCallFn
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()

  const apiCall: ApiCallFn = useMemo(() => {
    const callApi: ApiCallFn = async function <T>(
      url: string,
      options: ApiCallOptions = {}
    ): Promise<ApiCallResult<T>> {
      const { body, ...rest } = options

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((rest.headers as Record<string, string> | undefined) ?? {}),
      }

      if (auth.token) {
        headers['Authorization'] = `Bearer ${auth.token}`
      }

      try {
        const res = await fetch(url, {
          ...rest,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        })

        const data = (await res.json()) as T | { error?: string }

        if (!res.ok) {
          return {
            data: null,
            error: (data as { error?: string }).error ?? `HTTP ${res.status}`,
            status: res.status,
          }
        }

        return { data: data as T, error: null, status: res.status }
      } catch (err) {
        return {
          data: null,
          error: err instanceof Error ? err.message : 'Network error',
          status: 0,
        }
      }
    }

    return callApi
  }, [auth.token])

  const value = useMemo<AuthContextValue>(
    () => ({ ...auth, apiCall }),
    [auth, apiCall]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside <AuthProvider>')
  return ctx
}
