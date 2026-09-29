/** Derives display-ready battlefield state from session and interaction inputs. */
export { useBattlefieldDisplayState } from './useBattlefieldDisplayState'

/** Contracts exposed by the battlefield display feature. */
export type { BattlefieldDisplayState, RightRailStackPanelViewModel, UseBattlefieldDisplayStateOptions } from './types'

/** Validates the client snapshot before display projection. */
export { validateBattlefieldSnapshot } from './snapshotValidation'
