import { useEffect, useState, type ReactNode } from 'react'
import { getCurrentReturnTo, buildLoginRedirect } from '../lib/authRouting'
import { getAuthSession, type AuthSession } from '../lib/authSession'

export type RequireAuthProps = {
  children: ReactNode
  navigate?: (path: string) => void
}

export function RequireAuth({ children, navigate }: RequireAuthProps) {
  const [session] = useState<AuthSession | null>(() => getAuthSession())
  const [returnTo] = useState(() => getCurrentReturnTo())
  const loginPath = buildLoginRedirect(returnTo)

  useEffect(() => {
    if (session !== null) {
      return
    }

    (navigate ?? ((path: string) => window.location.replace(path)))(loginPath)
  }, [loginPath, navigate, session])

  if (session !== null) {
    return <>{children}</>
  }

  return (
    <div className="shell connect-shell" data-testid="auth-redirecting">
      <section className="panel connect-panel">
        <p className="eyebrow">Authentication required</p>
        <h1>Taking you to sign in</h1>
      </section>
    </div>
  )
}
