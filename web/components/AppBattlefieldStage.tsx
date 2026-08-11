import type { ComponentProps } from 'react'

import { BattlefieldStage } from './BattlefieldStage'

type AppBattlefieldStageProps = ComponentProps<typeof BattlefieldStage> & {
  scenarioMap: ComponentProps<typeof BattlefieldStage>['scenarioMap'] | null
}

export function AppBattlefieldStage({ scenarioMap, ...props }: AppBattlefieldStageProps) {
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
