// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ScenarioInfoDialog, type ScenarioInfoDialogData } from '#web/components/ScenarioInfoDialog'
import { buildScenarioManifest, type ScenarioDetailResponse } from '#web/lib/scenarioInfo'

const data: ScenarioInfoDialogData = {
  scenarioName: "The Siege of Shrek's Swamp",
  description: 'The Onion must destroy The Swamp and escape off-map.',
  objectives: [
    { id: 'destroy-swamp', label: 'Destroy The Swamp', required: true, completed: false },
  ],
  escapeHexes: ['2, 9', '3, 10'],
  onionDescription: 'Escape after the Swamp is destroyed.',
  defenderDescription: 'Stop the Onion before it escapes.',
  manifest: {
    onion: ['The Onion'],
    defender: ['1 x The Swamp', '5 x Little Pigs'],
  },
}

describe('ScenarioInfoDialog', () => {
  it('aggregates deployments into quantity-bearing manifest entries', () => {
    const detail: ScenarioDetailResponse = {
      initialState: {
        deployments: {
          'swamp-1': { type: 'Swamp', side: 'defender' },
          'pigs-stack-1': { unitType: 'LittlePigs', side: 'defender', count: 3 },
          'pigs-stack-2': { unitType: 'LittlePigs', side: 'defender', count: 2 },
        },
      },
    }

    expect(buildScenarioManifest(detail, null)).toEqual({
      onion: [],
      defender: ['1 x Swamp', '5 x Little Pigs'],
    })
  })

  it('shows scenario details and closes from the dialog control', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<ScenarioInfoDialog data={data} loading={false} error={null} onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: "The Siege of Shrek's Swamp" })).toBeInTheDocument()
    expect(screen.getByText('The Onion must destroy The Swamp and escape off-map.')).toBeInTheDocument()
    expect(screen.getByText('Destroy The Swamp')).toBeInTheDocument()
    expect(screen.getByText('Escape hexes:').parentElement).toHaveTextContent('Escape hexes are highlighted on the map with green crosshatch.')
    expect(screen.getByRole('heading', { name: 'Defenders' })).toBeInTheDocument()
    expect(screen.getByTestId('scenario-info-manifest')).toBeInTheDocument()
    expect(screen.getByText('5 x Little Pigs')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<ScenarioInfoDialog data={data} loading={false} error={null} onClose={onClose} />)
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
