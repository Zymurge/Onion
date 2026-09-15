import { useEffect, useRef } from 'react'
import type { ScenarioInfoData } from '../lib/scenarioInfo'

export type { ScenarioInfoData as ScenarioInfoDialogData } from '../lib/scenarioInfo'

type ScenarioInfoDialogProps = {
  data: ScenarioInfoData
  loading: boolean
  error: string | null
  onClose: () => void
}

export function ScenarioInfoDialog({ data, loading, error, onClose }: ScenarioInfoDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="scenario-info-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        onClose()
      }
    }}>
      <section className="scenario-info-dialog" role="dialog" aria-modal="true" aria-labelledby="scenario-info-title">
        <header className="scenario-info-dialog-header">
          <div>
            <p className="eyebrow">Scenario briefing</p>
            <h2 id="scenario-info-title">{data.scenarioName}</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="scenario-info-close" onClick={onClose}>
            Close
          </button>
        </header>

        {loading ? <p className="scenario-info-status">Loading scenario details...</p> : null}
        {error ? <p className="scenario-info-status scenario-info-status-error">{error}</p> : null}

        {data.description ? (
          <section className="scenario-info-section">
            <p className="eyebrow">Briefing</p>
            <p>{data.description}</p>
          </section>
        ) : null}

        <section className="scenario-info-section">
          <p className="eyebrow">Victory conditions</p>
          {data.objectives.length > 0 ? (
            <ul className="scenario-info-objective-list">
              {data.objectives.map((objective) => (
                <li key={objective.id} className={objective.completed ? 'is-complete' : undefined}>
                  <strong>{objective.label}</strong>
                  <span>{objective.required ? 'Required' : 'Optional'}{objective.completed ? ' · Complete' : ''}</span>
                </li>
              ))}
            </ul>
          ) : <p className="scenario-info-muted">No objective details are available.</p>}
          {data.onionDescription ? <p><strong>The Onion:</strong> {data.onionDescription}</p> : null}
          {data.escapeHexes.length > 0 ? (
            <p>
              <strong>Escape hexes:</strong> {data.escapeHexes.join(' · ')}. Escape hexes are highlighted on the map with green crosshatch.
            </p>
          ) : null}
          {data.defenderDescription ? <p><strong>Defenders:</strong> {data.defenderDescription}</p> : null}
        </section>

        <section className="scenario-info-section scenario-info-manifest" data-testid="scenario-info-manifest">
          <p className="eyebrow">Forces</p>
          <div className="scenario-info-manifest-columns">
            <div>
              <h3>The Onion</h3>
              {data.manifest.onion.length > 0 ? <ul>{data.manifest.onion.map((entry) => <li key={entry}>{entry}</li>)}</ul> : <p className="scenario-info-muted">No manifest available.</p>}
            </div>
            <div>
              <h3>Defenders</h3>
              {data.manifest.defender.length > 0 ? <ul>{data.manifest.defender.map((entry) => <li key={entry}>{entry}</li>)}</ul> : <p className="scenario-info-muted">No manifest available.</p>}
            </div>
          </div>
        </section>
      </section>
    </div>
  )
}
