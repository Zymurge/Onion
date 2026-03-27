import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { resolveWebRuntimeConfig } from './lib/appBootstrap'

const runtimeConfig = resolveWebRuntimeConfig(
  {
    VITE_ONION_API_URL: import.meta.env.VITE_ONION_API_URL,
  },
  window.location.search,
  window.location.pathname,
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      runtimeConfig={runtimeConfig}
      showConnectionGate={runtimeConfig.apiBaseUrl !== null || runtimeConfig.gameId !== null}
    />
  </StrictMode>,
)
