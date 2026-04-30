import { Component, type ErrorInfo, type ReactNode } from 'react'

import logger from '../lib/logger'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
    errorInfo: null,
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      error,
      errorInfo: null,
    }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error({ error, errorInfo }, '[app-error-boundary] app render error')
    this.setState({ error, errorInfo })
  }

  override render() {
    const { error, errorInfo } = this.state

    if (error !== null) {
      return (
        <div className="error-overlay error-overlay-app error-overlay-app-boundary" role="alert" aria-live="assertive">
          <div className="error-overlay-message">
            The app hit an unexpected render error. Please notify the dev or file a GitHub issue in the repo.
          </div>
          <div className="error-overlay-message">{error.message}</div>
          {errorInfo?.componentStack ? (
            <details className="error-overlay-details">
              <summary>Technical details</summary>
              <pre>{errorInfo.componentStack}</pre>
              {error.stack ? <pre>{error.stack}</pre> : null}
            </details>
          ) : null}
          <button
            type="button"
            className="error-overlay-dismiss"
            onClick={() => window.location.reload()}
          >
            Reload app
          </button>
        </div>
      )
    }

    return this.props.children
  }
}