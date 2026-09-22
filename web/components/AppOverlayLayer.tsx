import type { ReactNode } from 'react'

import { CombatResolutionToast } from './CombatResolutionToast'
import { ErrorOverlay } from './ErrorOverlay'
import { GameOverToast } from './GameOverToast'
import { MoveResolutionToast } from './MoveResolutionToast'
import { formatRamResolutionTitle } from '../lib/moveResolution'
import type { AppCommands } from '../lib/appCommands'
import type { AppNotificationPolicy } from '../lib/appNotificationPolicy'
import type { useBattlefieldDisplayState } from '../lib/useBattlefieldDisplayState'
import type { useBattlefieldInteractionState } from '../lib/useBattlefieldInteractionState'

export type AppOverlayLayerProps = {
  commands: Pick<AppCommands, 'dismissActionError' | 'dismissSessionError' | 'dismissGameOverToast' | 'dismissCombatResolution' | 'dismissRamResolution'>
  display: Pick<ReturnType<typeof useBattlefieldDisplayState>, 'selectedCombatTarget'> & Partial<Pick<ReturnType<typeof useBattlefieldDisplayState>, 'victoryObjectives'>>
  interaction: Pick<ReturnType<typeof useBattlefieldInteractionState>, 'actionError' | 'pendingCombatResolution' | 'pendingRamResolution'>
  notifications: Pick<AppNotificationPolicy, 'snapshotError' | 'shouldShowSnapshotError' | 'shouldShowSessionError' | 'sessionError' | 'shouldShowActionError' | 'sessionWinner' | 'shouldShowGameOverToast'>
}

export function AppOverlayLayer({ commands, display, interaction, notifications }: AppOverlayLayerProps): ReactNode {
  const pendingCombatResolution = interaction.pendingCombatResolution

  return (
    <>
      {notifications.shouldShowSnapshotError && notifications.snapshotError !== null ? (
        <ErrorOverlay
          message={notifications.snapshotError}
          placement="map"
          dismissible={false}
          onDismiss={() => undefined}
        />
      ) : null}
      {!notifications.shouldShowActionError && notifications.shouldShowSessionError && notifications.sessionError !== null ? (
        <ErrorOverlay
          message={notifications.sessionError.message}
          placement="map"
          onDismiss={commands.dismissSessionError}
        />
      ) : null}
      {notifications.shouldShowActionError && interaction.actionError !== null ? (
        <ErrorOverlay
          message={interaction.actionError}
          placement="app"
          onDismiss={commands.dismissActionError}
        />
      ) : null}
      {pendingCombatResolution !== null && pendingCombatResolution !== undefined && display.selectedCombatTarget !== null ? (
        <CombatResolutionToast
          title={`Combat resolved on ${display.selectedCombatTarget.label}`}
          resolution={pendingCombatResolution}
          modifiers={display.selectedCombatTarget.modifiers}
          onDismiss={commands.dismissCombatResolution}
        />
      ) : null}
      {interaction.pendingRamResolution?.map((resolution, index) => (
        <MoveResolutionToast
          key={`${resolution.unitId}:${resolution.rammedUnitId}:${index}`}
          title={formatRamResolutionTitle(resolution)}
          resolution={resolution}
          onDismiss={() => commands.dismissRamResolution(index)}
        />
      ))}
      {notifications.shouldShowGameOverToast && notifications.sessionWinner !== null ? (
        <GameOverToast
          winner={notifications.sessionWinner}
          objectives={display.victoryObjectives ?? []}
          onDismiss={commands.dismissGameOverToast}
        />
      ) : null}
    </>
  )
}