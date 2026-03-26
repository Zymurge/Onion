// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App smoke test', () => {
  it('renders the battlefield map shell', () => {
    render(<App />)

    expect(screen.queryByRole('img', { name: /swamp siege hex map/i })).not.toBeNull()
    expect(screen.queryByText(/defender command stack/i)).not.toBeNull()
    expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeNull()
  })

  it('updates the selected unit when a defender card is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByText(/Puss · operational · \(6,4\)/)).toBeNull()

    await user.click(screen.getByRole('button', { name: /puss-1/i }))

    expect(screen.queryByText(/Puss · operational · \(6,4\)/)).not.toBeNull()
    expect(screen.queryByText(/Mode Ready/)).not.toBeNull()
  })

  it('updates the action composer when the mode changes', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /end phase/i }))

    expect(screen.queryByText(/Pass control to the next phase when ready\./i)).not.toBeNull()
    expect(screen.queryByRole('button', { name: /end defender/i })).not.toBeNull()
    expect(screen.queryByText(/Not required/i)).not.toBeNull()
    expect(screen.queryByText(/n\/a/i)).not.toBeNull()
  })

  it('toggles the debug diagnostics popup', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByText(/Debug Diagnostics/i)).toBeNull()

    await user.click(screen.getByRole('button', { name: /toggle debug diagnostics/i }))

    expect(screen.queryByText(/Debug Diagnostics/i)).not.toBeNull()
    expect(screen.queryByText(/Game state loaded/i)).not.toBeNull()

    await user.click(screen.getByRole('button', { name: /^×$/ }))

    expect(screen.queryByText(/Debug Diagnostics/i)).toBeNull()
  })
})
