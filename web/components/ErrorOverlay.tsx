type ErrorOverlayProps = {
  message: string
  onDismiss: () => void
  className?: string
  placement?: 'corner' | 'map' | 'app'
  dismissible?: boolean
}

export function ErrorOverlay({
  message,
  onDismiss,
  className,
  placement = 'corner',
  dismissible = true,
}: ErrorOverlayProps) {
  return (
    <div
      className={['error-overlay', placement === 'app' ? 'error-overlay-app' : '', className].filter(Boolean).join(' ')}
      role="alert"
      aria-live="assertive"
    >
      <span className="error-overlay-message">{message}</span>
      <button type="button" className="error-overlay-dismiss" onClick={onDismiss} aria-label="Dismiss error" disabled={!dismissible}>
        Dismiss
      </button>
    </div>
  )
}