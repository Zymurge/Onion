// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ScenarioInfoDialog, type ScenarioInfoDialogData } from '#web/components/ScenarioInfoDialog'
import { buildScenarioInfoData, buildScenarioManifest, type ScenarioDetailResponse } from '#web/lib/scenarioInfo'

const data: ScenarioInfoDialogData = {
  scenarioName: "The Siege of Shrek's Swamp",
  description: 'The Onion must destroy The Swamp and escape off-map.',
  objectives: [
    { id: 'destroy-swamp', label: 'Destroy The Swamp', kind: 'destroy-unit', victor: 'onion', required: true, completed: false, detail: 'Destroy The Swamp to complete this condition.' },
    { id: 'escape-map', label: 'Reach an escape hex', kind: 'escape-map', victor: 'onion', required: true, completed: false, detail: 'Move The Onion to a marked escape hex. Escape zone: south side; green crosshatching marks it on the map.' },
    { id: 'immobilize-onion', label: 'Immobilize The Onion', kind: 'immobilize-onion', victor: 'defender', required: true, completed: false, detail: "Reduce The Onion's treads to zero to immobilize it." },
  ],
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

  it('generates default detail for each supported victory condition kind', () => {
    const scenarioInfo = buildScenarioInfoData(null, {
      initialState: { deployments: { 'swamp-1': { type: 'Swamp', side: 'defender' } } },
      victoryConditions: {
        objectives: [
          { id: 'destroy-swamp', label: 'Destroy The Swamp', kind: 'destroy-unit', unitId: 'swamp-1', victor: 'onion' },
          { id: 'escape-map', label: 'Reach an escape hex', kind: 'escape-map', victor: 'onion' },
          { id: 'immobilize-onion', label: 'Immobilize The Onion', kind: 'immobilize-onion', victor: 'defender' },
        ],
        onion: {
          escapeLocation: 'south side',
          escapeHexes: [{ q: 1, r: 2 }],
        },
      },
    }, null)
    const details = Object.fromEntries(scenarioInfo.objectives.map((objective) => [objective.id, objective.detail]))

    expect(details['destroy-swamp']).toContain('Destroy Swamp')
    expect(details['escape-map']).toContain('south side')
    expect(details['escape-map']).toContain('green crosshatching')
    expect(details['escape-map']).not.toContain('required prerequisites')
    expect(details['escape-map']).not.toContain('destroy')
    expect(details['immobilize-onion']).toBe("Reduce The Onion's treads to zero to immobilize it.")
    expect(details['immobilize-onion']).not.toContain('destroy')
  })

  it('shows scenario details and closes from the dialog control', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<ScenarioInfoDialog data={data} loading={false} error={null} onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: "The Siege of Shrek's Swamp" })).toBeInTheDocument()
    expect(screen.getByText('The Onion must destroy The Swamp and escape off-map.')).toBeInTheDocument()
    const victoryConditions = screen.getByRole('group', { name: 'Victory conditions' })
    expect(within(victoryConditions).getByRole('heading', { name: 'The Onion' })).toBeInTheDocument()
    const onionObjective = within(victoryConditions).getByText('Destroy The Swamp').closest('li')
    expect(onionObjective).toHaveAttribute('title', data.objectives[0].detail)
    const escapeObjective = within(victoryConditions).getByText('Reach an escape hex').closest('li')
    expect(escapeObjective).toHaveAttribute('title', data.objectives[1].detail)
    expect(within(victoryConditions).getByRole('heading', { name: 'Defenders' })).toBeInTheDocument()
    const defenderObjective = within(victoryConditions).getByText('Immobilize The Onion').closest('li')
    expect(defenderObjective).toHaveAttribute('title', data.objectives[2].detail)
    expect(screen.queryByText('Escape via the south side after the Swamp is destroyed.')).toBeNull()
    expect(screen.queryByText('Stop the Onion before it escapes.')).toBeNull()
    expect(within(victoryConditions).queryByText(/Escape zone:/)).toBeNull()
    expect(within(victoryConditions).queryByText('Required')).toBeNull()
    expect(within(victoryConditions).queryByText('Optional')).toBeNull()
    expect(screen.queryByText('2, 9')).toBeNull()
    expect(screen.queryByText('3, 10')).toBeNull()
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
