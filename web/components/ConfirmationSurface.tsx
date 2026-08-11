import type { ReactNode } from 'react'

type ConfirmationSurfaceProps = {
  children: ReactNode
  dataTestId?: string
  summary?: ReactNode
  actions?: ReactNode
}

export function ConfirmationSurface({ children, dataTestId, summary, actions }: ConfirmationSurfaceProps) {
  return (
    <article className="combat-confirmation-view" data-testid={dataTestId}>
      <span data-testid="confirmation-surface" hidden aria-hidden="true" />
      {children}
      {summary}
      {actions ? <div className="combat-confirmation-actions">{actions}</div> : null}
    </article>
  )
}
