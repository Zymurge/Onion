// @vitest-environment jsdom
import { Component } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppErrorBoundary } from '#web/components/AppErrorBoundary'

class Boom extends Component {
  override render(): never {
    throw new Error('boom')
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AppErrorBoundary', () => {
  it('renders an app-level fallback when a child throws during render', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/unexpected render error/i)
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    expect(screen.getByRole('button', { name: /reload app/i })).not.toBeNull()

    consoleErrorSpy.mockRestore()
  })
})