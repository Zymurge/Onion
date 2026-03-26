import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { resolveWebRuntimeConfig } from './lib/appBootstrap'

const runtimeConfig = resolveWebRuntimeConfig(import.meta.env, window.location.search)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      runtimeConfig={runtimeConfig}
      showConnectionGate={runtimeConfig.apiBaseUrl !== null || runtimeConfig.gameId !== null}
    />
  </StrictMode>,
)
