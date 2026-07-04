import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'

import '@testing-library/jest-dom/vitest'

function installGlobal<T>(key: string, value: T): void {
	Object.defineProperty(globalThis, key, {
		configurable: true,
		value,
		writable: true,
	})
}

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

if (typeof document === 'undefined') {
	const dom = new JSDOM('<!doctype html><html><body></body></html>', {
		url: 'http://localhost/',
	})

	const globalScope = globalThis as any
	const { window } = dom

	installGlobal('window', window)
	installGlobal('document', window.document)
	installGlobal('navigator', window.navigator)
	installGlobal('HTMLElement', window.HTMLElement)
	installGlobal('SVGElement', window.SVGElement)
	installGlobal('Node', window.Node)
	installGlobal('MutationObserver', window.MutationObserver)
	installGlobal('getComputedStyle', window.getComputedStyle.bind(window))
	installGlobal('requestAnimationFrame', window.requestAnimationFrame?.bind(window) ?? ((callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0)))
	installGlobal('cancelAnimationFrame', window.cancelAnimationFrame?.bind(window) ?? ((handle: number) => clearTimeout(handle)))
}

afterEach(() => {
	cleanup()
	document.body.innerHTML = ''
})

afterEach(() => {
	consoleErrorSpy.mockClear()
	consoleWarnSpy.mockClear()
})
