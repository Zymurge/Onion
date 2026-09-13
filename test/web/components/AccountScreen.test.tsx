// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountScreen } from '#web/components/AccountScreen'
import { saveAuthSession } from '#web/lib/authSession'

describe('AccountScreen', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('shows the account placeholder with lobby navigation', () => {
    saveAuthSession({
      apiBaseUrl: 'http://localhost:3000',
      username: 'player-1',
      userId: 'user-1',
      token: 'token-1',
    })

    render(<AccountScreen />)

    expect(screen.getByRole('heading', { name: 'Account' })).not.toBeNull()
    expect(screen.getByText('Account management tools will be available here soon.')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/user/dashboard')
    expect(screen.getByRole('link', { name: 'Find Game' })).toHaveAttribute('href', '/games')
    expect(screen.getByRole('link', { name: 'Create Game' })).toHaveAttribute('href', '/game/create')
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/user/create')
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page')
  })

  it('clears the account session and returns to login', async () => {
    const navigate = vi.fn()
    const user = userEvent.setup()
    saveAuthSession({
      apiBaseUrl: 'http://localhost:3000',
      username: 'player-1',
      userId: 'user-1',
      token: 'token-1',
    })

    render(<AccountScreen navigate={navigate} />)
    await user.click(screen.getByRole('button', { name: 'Sign Out' }))

    expect(window.localStorage.getItem('onion.auth.session')).toBeNull()
    expect(navigate).toHaveBeenCalledWith('/user/login')
  })
})
