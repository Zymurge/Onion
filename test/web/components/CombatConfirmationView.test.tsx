// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CombatConfirmationView } from '#web/components/CombatConfirmationView'

describe('CombatConfirmationView', () => {
  it('renders the attack ratio and relevant modifiers', () => {
    render(
      <CombatConfirmationView
        title="Confirm attack on Puss"
        attackStrength={4}
        defenseStrength={4}
        modifiers={['Ridgeline cover: +1 defense', 'Stacked defense: 1 squad']}
        dataTestId="combat-confirmation-view"
      />,
    )

    expect(screen.getByTestId('combat-confirmation-view')).not.toBeNull()
    expect(screen.queryByText(/^Combat$/i)).toBeNull()
    expect(screen.getByText(/Attack:Defense ratio/i)).not.toBeNull()
    expect(screen.getByText(/^1:1$/i)).not.toBeNull()
    expect(screen.getByText(/Ridgeline cover: \+1 defense/i)).not.toBeNull()
    expect(screen.getByText(/Stacked defense: 1 squad/i)).not.toBeNull()
  })

  it('shows a no-modifiers message when none are present', () => {
    render(
      <CombatConfirmationView
        title="Confirm attack on Wolf"
        attackStrength={3}
        defenseStrength={1}
        modifiers={[]}
        dataTestId="combat-confirmation-view"
      />,
    )

    expect(screen.getByText(/^3:1$/i)).not.toBeNull()
    expect(screen.getByText(/No additional modifiers/i)).not.toBeNull()
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

    screen.getByRole('button', { name: /resolve combat/i }).click()
    expect(onConfirm).toHaveBeenCalledTimes(1)
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

    expect(screen.getByText(/^2:1$/i)).not.toBeNull()
    expect(screen.getByText(/Confirm attack on Wolf/i)).not.toBeNull()
    expect(screen.getByText(/^confirmation$/i)).not.toBeNull()
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
    expect(onConfirm).not.toHaveBeenCalled()

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})