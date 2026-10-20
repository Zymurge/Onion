import { useEffect, useRef } from 'react'
import type { ScenarioInfoData } from '../lib/scenarioInfo'
import { ScenarioDescription, ScenarioForceManifest, ScenarioVictoryConditions } from './ScenarioBriefingContent'

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
            <ScenarioDescription text={data.description} />
          </section>
        ) : null}

        <section className="scenario-info-section">
          <p className="eyebrow">Victory conditions</p>
          <ScenarioVictoryConditions objectives={data.objectives} />
        </section>

        <section className="scenario-info-section scenario-info-manifest" data-testid="scenario-info-manifest">
          <p className="eyebrow">Forces</p>
          <ScenarioForceManifest manifest={data.manifest} />
        </section>
      </section>
    </div>
  )
}
