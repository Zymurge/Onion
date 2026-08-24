import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { RegisterGate } from './components/RegisterGate'
import { GameCreateScreen } from './components/GameCreateScreen'
import { resolveWebRuntimeConfig } from './lib/appBootstrap'
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
Object.assign(window, {
  setWebLoggerLevel,
  getWebLoggerLevel,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      {runtimeConfig.userRoute === 'create' ? (
        <RegisterGate runtimeConfig={runtimeConfig} />
      ) : runtimeConfig.userRoute === 'game-create' ? (
        <GameCreateScreen runtimeConfig={runtimeConfig} />
      ) : (
        <App
          runtimeConfig={runtimeConfig}
          showConnectionGate={runtimeConfig.userRoute !== null || runtimeConfig.apiBaseUrl !== null || runtimeConfig.gameId !== null}
        />
      )}
    </AppErrorBoundary>
  </StrictMode>,
)
