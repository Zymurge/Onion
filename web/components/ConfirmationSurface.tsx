import type { ReactNode } from 'react'

type ConfirmationSurfaceProps = {
  children: ReactNode
  dataTestId?: string
  eyebrow?: ReactNode
  title?: ReactNode
  badge?: ReactNode
  summary?: ReactNode
  actions?: ReactNode
}

export function ConfirmationSurface({ children, dataTestId, eyebrow, title, badge, summary, actions }: ConfirmationSurfaceProps) {
  return (
    <article className="combat-confirmation-view" data-testid={dataTestId}>
      <span data-testid="confirmation-surface" hidden aria-hidden="true" />
      {title !== undefined ? (
        <div className="card-head combat-confirmation-head">
          <div>
            {eyebrow !== undefined ? <p className="eyebrow">{eyebrow}</p> : null}
            <h3>{title}</h3>
          </div>
          {badge !== undefined ? <span className="mini-tag mini-tag-live">{badge}</span> : null}
        </div>
      ) : null}
      {children}
      {summary}
      {actions ? <div className="combat-confirmation-actions">{actions}</div> : null}
    </article>
  )
}
