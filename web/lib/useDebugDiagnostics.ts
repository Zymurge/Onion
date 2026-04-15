import { useState, useSyncExternalStore } from 'react'
import {
  getApiProtocolTrafficSnapshot,
  getApiProtocolTrafficVersion,
  type ApiProtocolTrafficEntry,
  sanitizeApiProtocolTrafficEntry,
  subscribeApiProtocolTraffic,
} from '../../shared/apiProtocol'
import type { DebugPopupLayout } from '../components/DraggableDebugPopup'

export function useDebugDiagnostics() {
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugPopupLayout, setDebugPopupLayout] = useState<DebugPopupLayout>(() => ({
    position: { x: window.innerWidth - 380, y: 90 },
    size: { width: 340, height: 400 },
  }))

  useSyncExternalStore(
    (onStoreChange) => {
      if (!debugOpen) {
        return () => {}
      }

      return subscribeApiProtocolTraffic(() => {
        onStoreChange()
      })
    },
    () => (debugOpen ? getApiProtocolTrafficVersion() : 0),
    () => 0,
  )

  const debugEntries = debugOpen
    ? getApiProtocolTrafficSnapshot()
      .slice()
      .reverse()
      .slice(0, 400)
      .map((entry: ApiProtocolTrafficEntry) => sanitizeApiProtocolTrafficEntry(entry))
    : []

  return {
    debugEntries,
    debugOpen,
    debugPopupLayout,
    setDebugOpen,
    setDebugPopupLayout,
  }
}
