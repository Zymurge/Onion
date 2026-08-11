// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useHexMapZoom } from '#web/lib/useHexMapZoom'

describe('useHexMapZoom', () => {
  it('clamps directional zoom changes to the supported range', () => {
    const { result } = renderHook(() => useHexMapZoom({ width: 1000, height: 800 }))

    act(() => {
      result.current.setZoomPercent(250)
    })
    expect(result.current.zoomPercent).toBe(200)

    act(() => {
      result.current.adjustZoom(-1)
    })
    expect(result.current.zoomPercent).toBe(195)
  })

  it('anchors the viewport when zoom changes', () => {
    const { result } = renderHook(() => useHexMapZoom({ width: 1000, height: 800 }))
    const viewport = result.current.scrollViewportRef.current
    expect(viewport).toBeNull()

    const scrollTo = vi.fn()
    const element = document.createElement('div')
    Object.defineProperties(element, {
      clientWidth: { value: 400 },
      clientHeight: { value: 300 },
      scrollLeft: { value: 100, writable: true },
      scrollTop: { value: 80, writable: true },
      scrollTo: { value: scrollTo },
    })
    result.current.scrollViewportRef.current = element

    act(() => {
      result.current.setZoomPercent(150)
    })

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
  })
})