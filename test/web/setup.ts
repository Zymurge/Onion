import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'

import '@testing-library/jest-dom/vitest'

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

if (typeof document === 'undefined') {
	const dom = new JSDOM('<!doctype html><html><body></body></html>', {
		url: 'http://localhost/',
	})

	const globalScope = globalThis as any
	const { window } = dom

	globalScope.window = window
	globalScope.document = window.document
	globalScope.navigator = window.navigator
	globalScope.HTMLElement = window.HTMLElement
	globalScope.SVGElement = window.SVGElement
	globalScope.Node = window.Node
	globalScope.MutationObserver = window.MutationObserver
	globalScope.getComputedStyle = window.getComputedStyle.bind(window)
	globalScope.requestAnimationFrame = window.requestAnimationFrame.bind(window)
	globalScope.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
}

afterEach(() => {
	cleanup()
	document.body.innerHTML = ''
})

afterEach(() => {
	consoleErrorSpy.mockClear()
	consoleWarnSpy.mockClear()
})
