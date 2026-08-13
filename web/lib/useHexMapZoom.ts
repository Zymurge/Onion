import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.05
const ZOOM_PERCENT_MIN = Math.round(ZOOM_MIN * 100)
const ZOOM_PERCENT_MAX = Math.round(ZOOM_MAX * 100)
const ZOOM_PERCENT_STEP = Math.round(ZOOM_STEP * 100)

function clampZoomPercent(value: number): number {
  return Math.max(ZOOM_PERCENT_MIN, Math.min(ZOOM_PERCENT_MAX, value))
}

/** Owns map zoom state, scroll anchoring, and wheel interactions. */
export function useHexMapZoom(bounds: { width: number; height: number }) {
  const [zoomPercentValue, setZoomPercentValue] = useState(100)
  const scrollViewportRef = useRef<HTMLDivElement | null>(null)
  const zoomSliderRef = useRef<HTMLInputElement | null>(null)
  const previousZoomRef = useRef(1)
  const zoomPercent = clampZoomPercent(zoomPercentValue)
  const zoomLevel = zoomPercent / 100
  const scaledBounds = {
    width: bounds.width * zoomLevel,
    height: bounds.height * zoomLevel,
  }

  function setZoomPercent(value: number) {
    setZoomPercentValue(clampZoomPercent(value))
  }

  function adjustZoom(direction: 1 | -1) {
    setZoomPercentValue((current) => clampZoomPercent(current + direction * ZOOM_PERCENT_STEP))
  }

  useLayoutEffect(() => {
    const viewport = scrollViewportRef.current

    if (!viewport) {
      previousZoomRef.current = zoomLevel
      return
    }

    const previousZoom = previousZoomRef.current
    if (previousZoom === zoomLevel) {
      return
    }

    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / previousZoom
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / previousZoom
    const nextScrollLeft = Math.max(0, Math.min(centerX * zoomLevel - viewport.clientWidth / 2, scaledBounds.width - viewport.clientWidth))
    const nextScrollTop = Math.max(0, Math.min(centerY * zoomLevel - viewport.clientHeight / 2, scaledBounds.height - viewport.clientHeight))

    if (typeof viewport.scrollTo === 'function') {
      viewport.scrollTo({ left: nextScrollLeft, top: nextScrollTop, behavior: 'auto' })
    } else {
      viewport.scrollLeft = nextScrollLeft
      viewport.scrollTop = nextScrollTop
    }

    previousZoomRef.current = zoomLevel
  }, [scaledBounds.height, scaledBounds.width, zoomLevel])

  useEffect(() => {
    const viewport = scrollViewportRef.current

    if (!viewport) {
      return undefined
    }

    const activeViewport = viewport

    function handleWheel(event: WheelEvent) {
      if (event.deltaX === 0 && event.deltaY === 0) {
        return
      }

      event.preventDefault()

      if (typeof activeViewport.scrollBy === 'function') {
        activeViewport.scrollBy({ left: event.deltaX, top: event.deltaY, behavior: 'auto' })
        return
      }

      activeViewport.scrollLeft += event.deltaX
      activeViewport.scrollTop += event.deltaY
    }

    activeViewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => activeViewport.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => {
    const slider = zoomSliderRef.current

    if (!slider) {
      return undefined
    }

    function handleWheel(event: WheelEvent) {
      if (event.deltaY === 0) {
        return
      }

      event.preventDefault()
      adjustZoom(event.deltaY < 0 ? 1 : -1)
    }

    slider.addEventListener('wheel', handleWheel, { passive: false })
    return () => slider.removeEventListener('wheel', handleWheel)
  })

  return {
    adjustZoom,
    maxZoomPercent: ZOOM_PERCENT_MAX,
    minZoomPercent: ZOOM_PERCENT_MIN,
    scaledBounds,
    scrollViewportRef,
    setZoomPercent,
    stepZoomPercent: ZOOM_PERCENT_STEP,
    zoomLevel,
    zoomPercent,
    zoomSliderRef,
  }
}