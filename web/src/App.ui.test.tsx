// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App UI', () => {
  it('renders a waiting state instead of mock battlefield data before game state loads', () => {
    render(<App />)

    expect(screen.queryByRole('img', { name: /swamp siege hex map/i })).toBeNull()
    expect(screen.queryByText(/defender command stack/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeNull()
    expect(screen.queryByText(/^Waiting$/i, { selector: '.role-badge' })).not.toBeNull()
    expect(
      screen.getByText((_, element) => element?.classList.contains('phase-chip-state') === true && element.textContent === 'WAITING'),
    ).not.toBeNull()
    expect(screen.queryByText(/Turn waiting/i)).not.toBeNull()
    expect(screen.queryByText(/waiting for game state/i)).not.toBeNull()
    expect(screen.queryByRole('button', { name: /puss-1/i })).toBeNull()
    expect(screen.queryByText(/battlefield will appear once the game state loads/i)).not.toBeNull()
  })

  it('keeps unit details in a waiting state before authoritative battlefield data loads', () => {
    render(<App />)

    expect(screen.queryByText(/selected unit/i)).not.toBeNull()
    expect(screen.queryAllByText(/waiting for battlefield data/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/no defender data available/i)).toBeNull()
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
