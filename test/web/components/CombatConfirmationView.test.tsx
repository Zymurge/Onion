// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CombatConfirmationView } from '#web/components/CombatConfirmationView'
import logger from '#web/lib/logger'

describe('CombatConfirmationView', () => {
  it('renders the attack ratio and relevant modifiers', () => {
    render(
      <CombatConfirmationView
        title="Confirm attack on Puss"
        attackStrength={4}
        attackMemberCount={2}
        defenseStrength={4}
        modifiers={['Ridgeline cover: +1 defense', 'Stacked defense: 1 squad']}
        dataTestId="combat-confirmation-view"
      />,
    )

    expect(screen.getByTestId('combat-confirmation-view')).not.toBeNull()
    expect(screen.getByText(/^Attack$/i)).not.toBeNull()
    expect(screen.getAllByText(/^4$/i)).toHaveLength(2)
    expect(screen.getByText(/^Attackers$/i)).not.toBeNull()
    expect(screen.getByText(/^2$/i)).not.toBeNull()
    expect(screen.getByText(/^Defense$/i)).not.toBeNull()
    expect(screen.getByText(/^Odds$/i)).not.toBeNull()
    expect(screen.getByText(/^1:1$/i)).not.toBeNull()
  })

  it('ignores modifiers in the compact summary', () => {
    render(
      <CombatConfirmationView
        title="Confirm attack on Wolf"
        attackStrength={3}
        defenseStrength={1}
        modifiers={[]}
        dataTestId="combat-confirmation-view"
      />,
    )

    expect(screen.getByText(/^Attack$/i)).not.toBeNull()
    expect(screen.getByText(/^3$/i)).not.toBeNull()
    expect(screen.getByText(/^Attackers$/i)).not.toBeNull()
    expect(screen.getByText(/^0$/i)).not.toBeNull()
    expect(screen.getByText(/^Defense$/i)).not.toBeNull()
    expect(screen.getByText(/^Odds$/i)).not.toBeNull()
    expect(screen.getByText(/^3:1$/i)).not.toBeNull()
  })

  it('renders a confirm button when a handler is provided', () => {
    const onConfirm = vi.fn()

    render(
      <CombatConfirmationView
        title="Confirm attack on Wolf"
        attackStrength={3}
        defenseStrength={1}
        modifiers={[]}
        confirmLabel="Resolve combat"
        onConfirm={onConfirm}
        dataTestId="combat-confirmation-view"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /resolve combat/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('uses the default confirm label when none is provided', () => {
    render(
      <CombatConfirmationView
        title="Confirm attack on Wolf"
        attackStrength={3}
        defenseStrength={1}
        modifiers={[]}
        onConfirm={vi.fn()}
        dataTestId="combat-confirmation-view"
      />,
    )

    expect(screen.getByRole('button', { name: /confirm attack/i })).not.toBeNull()
  })

  it('uses the default label and hides actions when no handler is provided', () => {
    render(
      <CombatConfirmationView
        title="Confirm attack on Wolf"
        attackStrength={5}
        defenseStrength={2}
        modifiers={[]}
        dataTestId="combat-confirmation-view"
      />,
    )

    expect(screen.getByText(/^Attack$/i)).not.toBeNull()
    expect(screen.getByText(/^5$/i)).not.toBeNull()
    expect(screen.getByText(/^Attackers$/i)).not.toBeNull()
    expect(screen.getByText(/^0$/i)).not.toBeNull()
    expect(screen.getByText(/^Defense$/i)).not.toBeNull()
    expect(screen.getByText(/^Odds$/i)).not.toBeNull()
    expect(screen.getByText(/^2:1$/i)).not.toBeNull()
    expect(screen.getByText(/Confirm attack on Wolf/i)).not.toBeNull()
    expect(screen.queryByRole('button', { name: /confirm attack/i })).toBeNull()
  })

  it('renders a disabled confirm button without calling the handler', () => {
    const onConfirm = vi.fn()

    render(
      <CombatConfirmationView
        title="Confirm attack on Wolf"
        attackStrength={5}
        defenseStrength={2}
        modifiers={[]}
        confirmLabel="Resolve combat"
        onConfirm={onConfirm}
        isDisabled
        dataTestId="combat-confirmation-view"
      />,
    )

    const button = screen.getByRole('button', { name: /resolve combat/i })
    expect(button).toBeDisabled()

    fireEvent.click(button)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('logs unexpected confirm handler errors', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined)

    render(
      <CombatConfirmationView
        title="Confirm attack on Wolf"
        attackStrength={5}
        defenseStrength={2}
        modifiers={[]}
        confirmLabel="Resolve combat"
        onConfirm={() => {
          throw new Error('boom')
        }}
        dataTestId="combat-confirmation-view"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /resolve combat/i }))

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Confirm attack on Wolf',
        error: expect.any(Error),
      }),
      '[combat-confirmation] confirm handler failed',
    )

    errorSpy.mockRestore()
  })
})