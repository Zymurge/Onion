import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { GameCreateScreen } from './components/GameCreateScreen'
import { LoginScreen } from './components/LoginScreen'
import { RequireAuth } from './components/RequireAuth'
import { UserDashboard } from './components/UserDashboard'
import { GamesScreen } from './components/GamesScreen'
import { AccountScreen } from './components/AccountScreen'
import { GameHistoryScreen } from './components/GameHistoryScreen'
import { resolveWebDocumentTitle, resolveWebRuntimeConfig } from './lib/appBootstrap'
import { getWebLoggerLevel, setWebLoggerLevel } from './lib/logger'

const runtimeConfig = resolveWebRuntimeConfig(
  {
    VITE_ONION_API_URL: import.meta.env.VITE_ONION_API_URL,
    VITE_ONION_LIVE_REFRESH_QUIET_WINDOW_MS: import.meta.env.VITE_ONION_LIVE_REFRESH_QUIET_WINDOW_MS,
  },
  window.location.search,
  window.location.pathname,
)

setWebLoggerLevel(runtimeConfig.clientLogLevel)
document.title = resolveWebDocumentTitle(runtimeConfig)
Object.assign(window, {
  setWebLoggerLevel,
  getWebLoggerLevel,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      {runtimeConfig.userRoute === 'create' ? (
        <RequireAuth>
          <AccountScreen />
        </RequireAuth>
      ) : runtimeConfig.userRoute === 'login' ? (
        <LoginScreen runtimeConfig={runtimeConfig} />
      ) : runtimeConfig.userRoute === 'game-create' ? (
        <RequireAuth>
          <GameCreateScreen runtimeConfig={runtimeConfig} />
        </RequireAuth>
      ) : runtimeConfig.userRoute === 'dashboard' ? (
        <RequireAuth>
          <UserDashboard />
        </RequireAuth>
      ) : runtimeConfig.userRoute === 'games' ? (
        <RequireAuth>
          <GamesScreen />
        </RequireAuth>
      ) : runtimeConfig.userRoute === 'history' ? (
        <RequireAuth>
          <GameHistoryScreen />
        </RequireAuth>
      ) : runtimeConfig.gameId !== null ? (
        <RequireAuth>
          <App runtimeConfig={runtimeConfig} gameId={runtimeConfig.gameId} showConnectionGate={false} />
        </RequireAuth>
      ) : (
        <RequireAuth returnTo="/user/dashboard" authenticatedRedirectTo="/user/dashboard">
          <UserDashboard />
        </RequireAuth>
      )}
    </AppErrorBoundary>
  </StrictMode>,
)
