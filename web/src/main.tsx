import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createDefaultGameClient, resolveWebRuntimeConfig } from './lib/appBootstrap'

const runtimeConfig = resolveWebRuntimeConfig(import.meta.env, window.location.search)
const gameClient = createDefaultGameClient(import.meta.env, window.location.search)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App gameClient={gameClient} gameId={runtimeConfig.gameId ?? undefined} />
  </StrictMode>,
)
