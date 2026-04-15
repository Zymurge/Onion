import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import ReactJsonPrintImport from 'react-json-print'

import type { ApiProtocolTrafficEntry } from '../../shared/apiProtocol'
import { formatDebugEntrySummary } from '../lib/appViewHelpers'

const ReactJsonPrint =
  typeof ReactJsonPrintImport === 'function'
    ? ReactJsonPrintImport
    : (ReactJsonPrintImport as { default?: typeof ReactJsonPrintImport }).default ?? ReactJsonPrintImport

export type DebugPopupLayout = {
  position: { x: number; y: number }
  size: { width: number; height: number }
}

type DraggableDebugPopupProps = {
  layout: DebugPopupLayout
  onLayoutChange: (nextLayout: DebugPopupLayout) => void
  onClose: () => void
  lines: ReadonlyArray<ApiProtocolTrafficEntry>
  onAdvancePhase: () => void
}

export function DraggableDebugPopup({
  layout,
  onLayoutChange,
  onClose,
  lines,
  onAdvancePhase,
}: DraggableDebugPopupProps) {
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })

  function onMouseDown(e: React.MouseEvent) {
    setDragging(true)
    setOffset({ x: e.clientX - layout.position.x, y: e.clientY - layout.position.y })
    document.body.style.userSelect = 'none'
  }

  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setResizing(true)
    setResizeStart({ x: e.clientX, y: e.clientY, width: layout.size.width, height: layout.size.height })
    document.body.style.userSelect = 'none'
  }

  function onMouseMove(e: MouseEvent) {
    if (dragging) {
      onLayoutChange({
        position: { x: e.clientX - offset.x, y: e.clientY - offset.y },
        size: layout.size,
      })
    }
    if (resizing) {
      const deltaX = e.clientX - resizeStart.x
      const deltaY = e.clientY - resizeStart.y
      const newWidth = Math.max(250, resizeStart.width + deltaX)
      const newHeight = Math.max(200, resizeStart.height + deltaY)
      onLayoutChange({
        position: layout.position,
        size: { width: newWidth, height: newHeight },
      })
    }
  }

  function onMouseUp() {
    setDragging(false)
    setResizing(false)
    document.body.style.userSelect = ''
  }

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
      return () => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }
    }
  })

  return createPortal(
    <div
      className="debug-popup"
      style={{ left: layout.position.x, top: layout.position.y, width: layout.size.width, height: layout.size.height }}
    >
      <div className="debug-popup-header" onMouseDown={onMouseDown} style={{ cursor: 'move' }}>
        <span>Debug Diagnostics</span>
        <button className="debug-popup-close" onClick={onClose} title="Close debug window">×</button>
      </div>
      <div className="debug-popup-body">
        {lines.length === 0 ? (
          <div className="debug-line">No protocol traffic yet.</div>
        ) : (
          lines.map((entry) => (
            <section key={entry.id} className="debug-entry">
              <div className="debug-entry-summary">{formatDebugEntrySummary(entry)}</div>
              <div className="debug-json-print">
                <ReactJsonPrint dataObject={entry} depth={0} />
              </div>
            </section>
          ))
        )}
      </div>
      <div className="debug-popup-footer">
        <button
          className="debug-cycle-phase-btn"
          onClick={onAdvancePhase}
          title="Send END_PHASE to the backend"
        >
          Advance Phase
        </button>
      </div>
      <div className="debug-popup-resize" onMouseDown={onResizeMouseDown} title="Drag to resize">⤡</div>
    </div>,
    document.body,
  )
}