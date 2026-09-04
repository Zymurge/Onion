import type { ComponentProps } from 'react'

import { BattlefieldStage } from './BattlefieldStage'
import type { ServerGameSnapshot } from '../lib/gameClient'

type AppBattlefieldStageProps = Omit<ComponentProps<typeof BattlefieldStage>, 'scenarioMap'> & {
  scenarioMap: ComponentProps<typeof BattlefieldStage>['scenarioMap'] | null
  lifecycleStatus?: ServerGameSnapshot['status']
}

export function AppBattlefieldStage({ lifecycleStatus, scenarioMap, ...props }: AppBattlefieldStageProps) {
  if (lifecycleStatus === 'waiting' || lifecycleStatus === 'ready') {
    return (
      <section className="panel map-stage" data-testid="app-battlefield-stage">
        <div className="lifecycle-gate" data-testid="game-lifecycle-gate" role="status">
          <p className="eyebrow">Match not active</p>
          <h2>{lifecycleStatus === 'waiting' ? 'Waiting for an opponent' : 'Waiting for the host to start'}</h2>
          <p className="summary-line">
            {lifecycleStatus === 'waiting'
              ? 'The battlefield will unlock when another player joins this match.'
              : 'The battlefield will unlock when the host starts this match.'}
          </p>
        </div>
      </section>
    )
  }

  if (scenarioMap !== null && props.onions.length > 0) {
    return <BattlefieldStage {...props} scenarioMap={scenarioMap} />
  }

  return (
    <section className="panel map-stage" data-testid="app-battlefield-stage">
      <div className="map-frame">
        <div className="hex-map-shell panel-subtle">
          <p className="summary-line">Battlefield will appear once the game state loads.</p>
        </div>
      </div>
    </section>
  )
}
