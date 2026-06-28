// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AttackPlanningConfirmationView } from '#web/components/AttackPlanningConfirmationView'
import logger from '#web/lib/logger'

describe('AttackPlanningConfirmationView', () => {
  it('renders build mode without target stats', () => {
    render(
      <AttackPlanningConfirmationView
        mode="build"
        title="Build attack"
        attackStrength={4}
        attackMemberCount={2}
        attackMemberLabels={['Little Pigs 1', 'Little Pigs 2']}
        dataTestId="combat-confirmation-view"
      />,
    )

    expect(screen.getByTestId('combat-confirmation-view')).not.toBeNull()
    expect(screen.getByText(/^Attack$/i)).not.toBeNull()
    expect(screen.getByText(/^4$/i)).not.toBeNull()
    expect(screen.getByText(/^Attackers$/i)).not.toBeNull()
    expect(screen.getByText(/^2$/i)).not.toBeNull()
    expect(screen.queryByText(/^Defense$/i)).toBeNull()
    expect(screen.queryByText(/^Odds$/i)).toBeNull()
    expect(screen.getByText(/Little Pigs 1/i)).not.toBeNull()
    expect(screen.getByText(/Little Pigs 2/i)).not.toBeNull()
  })

  it('renders confirm mode with defense and odds', () => {
    render(
      <AttackPlanningConfirmationView
        mode="confirm"
        title="Confirm attack on Puss"
        attackStrength={4}
        attackMemberCount={2}
        defenseStrength={4}
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

  it('throws when confirm mode is rendered without defense strength', () => {
    expect(() => render(
      <AttackPlanningConfirmationView
        {...({
          mode: 'confirm',
          title: 'Confirm attack on Wolf',
          attackStrength: 3,
          dataTestId: 'combat-confirmation-view',
        } as unknown as React.ComponentProps<typeof AttackPlanningConfirmationView>)}
      />,
    )).toThrow('AttackPlanningConfirmationView requires defenseStrength in confirm mode')
  })

  it('renders a confirm button when a handler is provided', () => {
    const onConfirm = vi.fn()

    render(
      <AttackPlanningConfirmationView
        mode="confirm"
        title="Confirm attack on Wolf"
        attackStrength={3}
        defenseStrength={1}
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
      <AttackPlanningConfirmationView
        mode="confirm"
        title="Confirm attack on Wolf"
        attackStrength={3}
        defenseStrength={1}
        onConfirm={vi.fn()}
        dataTestId="combat-confirmation-view"
      />,
    )

    expect(screen.getByRole('button', { name: /confirm attack/i })).not.toBeNull()
  })

  it('uses the default label and hides actions when no handler is provided in confirm mode', () => {
    render(
      <AttackPlanningConfirmationView
        mode="confirm"
        title="Confirm attack on Wolf"
        attackStrength={5}
        defenseStrength={2}
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

  it('renders a disabled confirm button in build mode when confirmation is not ready', () => {
    const onConfirm = vi.fn()

    render(
      <AttackPlanningConfirmationView
        mode="build"
        title="Build attack"
        attackStrength={5}
        onConfirm={onConfirm}
        isConfirmReady={false}
        dataTestId="combat-confirmation-view"
      />,
    )

    const button = screen.getByRole('button', { name: /confirm attack/i })
    expect(button).toBeDisabled()

    fireEvent.click(button)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('renders a disabled confirm button without calling the handler', () => {
    const onConfirm = vi.fn()

    render(
      <AttackPlanningConfirmationView
        mode="confirm"
        title="Confirm attack on Wolf"
        attackStrength={5}
        defenseStrength={2}
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
      <AttackPlanningConfirmationView
        mode="confirm"
        title="Confirm attack on Wolf"
        attackStrength={5}
        defenseStrength={2}
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