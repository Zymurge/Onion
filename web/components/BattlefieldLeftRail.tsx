import { useState, type MouseEvent } from 'react'
import { getBattlefieldPosition, statusTone, type BattlefieldOnionView, type BattlefieldUnit, type Mode } from '../lib/battlefieldView'
import {
  buildStackMemberSelectionId,
  buildWeaponSelectionId,
  resolveSelectionOwnerUnitId,
} from '../lib/selectionIds'
import { countSelectedBattlefieldStackMembers, filterStackRosterToUnitIds, shouldExpandBattlefieldStackGroup, type WebStackSourceState } from '../lib/stackSelection'
import { getBattlefieldStackSize, resolveBattlefieldDisplayName, resolveBattlefieldStackLabel, resolveBattlefieldUnitName } from '../lib/battlefieldNaming'
import { getBattlefieldWeaponAttack, getReadyWeaponRange, parseWeaponStats, resolveBattlefieldWeaponName } from '../lib/weaponStats'
import { getGroupAttackReadyCount, getUnitAttackStrength } from '../lib/stackReadiness'
import type { CombatWeaponDetail } from '../lib/actionEligibility/reasons'
import type { StackNamingSnapshot } from '../../shared/stackNaming'
import type { StackRosterState } from '../../shared/types/index'
import { getSessionWeaponType, type SessionCatalog } from '../lib/sessionCatalog'
import { routeInteraction, type InteractionRoutingRequest } from '../lib/interactionRouting'
import { buildBattlefieldRosterProjection } from '../lib/battlefieldGroupProjection'
import type { BattlefieldActionEligibility } from '../lib/actionEligibility/projection'
import type { CombatEligibility } from '../lib/actionEligibility/combat'
import type { MovementEligibility } from '../lib/actionEligibility/movement'
import { formatEligibilityReason } from '../lib/actionEligibility/reasons'
import logger from '../lib/logger'
import { ErrorOverlay } from './ErrorOverlay'

type BattlefieldLeftRailProps = {
  activeCombatRole: 'onion' | 'defender' | null
  activeRole: 'onion' | 'defender' | null
  activeTurnActive: boolean
  activeMode: Mode
  activeSelectedUnitIds: string[]
  actionEligibility?: BattlefieldActionEligibility
  displayedDefenders: ReadonlyArray<BattlefieldUnit>
  displayedOnion: BattlefieldOnionView | null
  displayedOnions?: ReadonlyArray<BattlefieldOnionView>
  isCombatPhase: boolean
  isMovementPhase: boolean
  isSelectionLocked: boolean
  stacksExpandable: boolean
  onionWeapons: {
    operationalWeapons: number
    operationalMissiles: number
  }
  readyWeaponDetails: ReadonlyArray<CombatWeaponDetail>
  combatUnitAvailabilityReasons?: Readonly<Record<string, string | undefined>>
  selectedCombatAttackLabel: string
  stackNaming?: StackNamingSnapshot
  stackRoster?: StackRosterState
  catalog?: SessionCatalog
  onSelectUnit: (unitId: string, additive?: boolean) => void
}

type DefenderStackGroupMember = {
  selectionId: string
  testId: string
  label: string
  isActionable: boolean
  disabledReason?: string
}

type DefenderStackGroup = {
  anchorUnit: BattlefieldUnit
  attackStrength: number
  attackReadyCount: number
  isActionable: boolean
  isDestroyed: boolean
  isPartiallyDestroyed: boolean
  hasDisabledUnit: boolean
  label: string
  members: DefenderStackGroupMember[]
  range: number
  moveAllowance: number
  selectedCount: number
  availabilityReason?: string
}

function buildDefenderSelectionState(
  displayedDefenders: ReadonlyArray<BattlefieldUnit>,
  stackRoster: StackRosterState | undefined,
  catalog: SessionCatalog | undefined,
): WebStackSourceState {
  const displayedDefenderIds = new Set(displayedDefenders.map((unit) => unit.unitId))
  const displayedStackRoster = filterStackRosterToUnitIds(stackRoster, displayedDefenderIds)

  return {
    defenders: Object.fromEntries(
      displayedDefenders.map((unit) => [unit.unitId, {
        unitId: unit.unitId,
        typeId: unit.typeId,
        position: getBattlefieldPosition(unit),
        state: unit.state,
        stackSize: unit.stackSize,
      }]),
    ),
    ...(displayedStackRoster === undefined ? {} : { stackRoster: displayedStackRoster }),
    catalog,
  }
}

function buildRenderErrorMessage(
  error: unknown,
  context: {
    activeCombatRole: 'onion' | 'defender' | null
    activeMode: Mode
    activeSelectedUnitIds: readonly string[]
    displayedDefenders: ReadonlyArray<BattlefieldUnit>
    isCombatPhase: boolean
    isMovementPhase: boolean
    stackRoster: StackRosterState | undefined
  },
): string {
  const errorMessage = error instanceof Error ? error.message : 'Unexpected render error'
  const detailMatch = /grouped unit ([^\s]+)/.exec(errorMessage)
  const selectedUnitId = detailMatch?.[1] ?? 'unknown'
  const displayedDefenderIds = context.displayedDefenders.map((unit) => unit.unitId).join(', ') || 'none'
  const rosterGroupKeys = Object.keys(context.stackRoster?.groupsById ?? {}).join(', ') || 'none'
  const phase = context.isCombatPhase
    ? 'combat'
    : context.isMovementPhase
      ? 'movement'
      : 'locked'

  return `${errorMessage} (selectedUnitId=${selectedUnitId}, phase=${phase}, activeRole=${context.activeCombatRole ?? 'none'}, mode=${context.activeMode}, selectedUnitIds=${context.activeSelectedUnitIds.join(', ') || 'none'}, displayedDefenders=${displayedDefenderIds}, stackRosterGroups=${rosterGroupKeys})`
}

function buildDefenderGroupFromUnits(
  units: ReadonlyArray<BattlefieldUnit>,
  groupMode: 'combat' | 'move',
  activeMode: Mode,
  activeSelectedUnitIds: readonly string[],
  stackNaming: StackNamingSnapshot | undefined,
  selectionState: WebStackSourceState,
  catalog: SessionCatalog | undefined,
  combatUnitAvailabilityReasons: Readonly<Record<string, string | undefined>> | undefined,
  actionEligibility: BattlefieldActionEligibility | undefined,
  groupKey?: string,
): DefenderStackGroup {
  const anchorUnit = units[0]
  const stackSize = units.length > 1 ? units.length : getBattlefieldStackSize(anchorUnit)
  const displayedUnits = resolveDisplayedStackUnits(units, activeSelectedUnitIds)
  const resolvedGroupKey = units.length > 1 ? groupKey : undefined
  const label = resolvedGroupKey !== undefined
    ? resolveBattlefieldStackLabel(anchorUnit.typeId, anchorUnit.unitId, anchorUnit.friendlyName, stackSize, resolvedGroupKey, stackNaming)
    : resolveBattlefieldDisplayName({ ...anchorUnit, stackSize }, stackNaming)
  const selectedCount = countSelectedBattlefieldStackMembers(selectionState, anchorUnit.unitId, activeSelectedUnitIds)
  const attackReadyCount = getGroupAttackReadyCount(displayedUnits, catalog)
  const projectedEligibilityForUnit = (unit: BattlefieldUnit): MovementEligibility | CombatEligibility | undefined => groupMode === 'move'
    ? actionEligibility?.movementByUnitId[unit.unitId]
    : actionEligibility?.defenderCombatByUnitId[unit.unitId]?.eligibility
  const isUnitActionable = (unit: BattlefieldUnit) => {
    const projectedEligibility = projectedEligibilityForUnit(unit)
    if (projectedEligibility !== undefined) {
      return projectedEligibility.eligible
    }

    return groupMode === 'combat'
      ? unit.state !== 'destroyed'
        && unit.actionableModes.includes(activeMode)
        && combatUnitAvailabilityReasons?.[unit.unitId] === undefined
      : unit.state !== 'destroyed'
  }
  const availabilityReasonForUnit = (unit: BattlefieldUnit) => {
    const legacyReason = combatUnitAvailabilityReasons?.[unit.unitId]
    const projectedEligibility = projectedEligibilityForUnit(unit)
    if (projectedEligibility === undefined) {
      return legacyReason
    }

    return projectedEligibility.eligible
      ? undefined
      : formatEligibilityReason(projectedEligibility.reason)
  }
  const unavailableCombatUnits = units.filter((unit) => availabilityReasonForUnit(unit) !== undefined)
  const members = units.length > 1
    ? units.map((unit) => ({
      selectionId: unit.unitId,
      testId: `combat-stack-member-${unit.unitId}`,
      label: resolveBattlefieldUnitName(unit.typeId, unit.unitId, unit.friendlyName),
      isActionable: isUnitActionable(unit),
      disabledReason: unit.state === 'destroyed' ? 'Destroyed' : availabilityReasonForUnit(unit),
    }))
    : stackSize > 1
      ? Array.from({ length: stackSize }, (_, index) => ({
        selectionId: buildStackMemberSelectionId(anchorUnit.unitId, index + 1),
        testId: `combat-stack-member-${anchorUnit.unitId}-${index + 1}`,
        label: resolveBattlefieldUnitName(anchorUnit.typeId, anchorUnit.unitId, anchorUnit.friendlyName),
        isActionable: isUnitActionable(anchorUnit),
        disabledReason: anchorUnit.state === 'destroyed' ? 'Destroyed' : availabilityReasonForUnit(anchorUnit),
      }))
      : []

  return {
    anchorUnit,
    attackStrength: displayedUnits.reduce((total, unit) => total + getUnitAttackStrength(unit, catalog), 0),
    attackReadyCount,
    isActionable: units.some(isUnitActionable),
    isDestroyed: groupMode === 'combat'
      ? units.every((unit) => unit.state === 'destroyed')
      : anchorUnit.state === 'destroyed',
    isPartiallyDestroyed: units.some((unit) => unit.state === 'destroyed')
      && units.some((unit) => unit.state !== 'destroyed'),
    hasDisabledUnit: units.some((unit) => unit.state === 'disabled'),
    label,
    members,
    availabilityReason: groupMode === 'combat' && unavailableCombatUnits.length === units.length
      ? availabilityReasonForUnit(anchorUnit) ?? 'Unavailable'
      : undefined,
    range: groupMode === 'combat'
      ? displayedUnits.length > 0
        ? Math.min(...displayedUnits.map((unit) => getReadyWeaponRange(unit.weapons, catalog)))
        : 0
      : 0,
    moveAllowance: groupMode === 'move' ? Math.max(...units.map((unit) => unit.movesRemaining)) : 0,
    selectedCount,
  }
}

function buildDefenderGroups(
  displayedDefenders: ReadonlyArray<BattlefieldUnit>,
  groupMode: 'combat' | 'move',
  activeMode: Mode,
  activeSelectedUnitIds: string[],
  stackNaming: StackNamingSnapshot | undefined,
  stackRoster: StackRosterState | undefined,
  catalog: SessionCatalog | undefined,
  combatUnitAvailabilityReasons: Readonly<Record<string, string | undefined>> | undefined,
  actionEligibility: BattlefieldActionEligibility | undefined,
): DefenderStackGroup[] {
  const projection = stackRoster !== undefined
    ? buildBattlefieldRosterProjection(displayedDefenders, stackRoster)
    : null
  const selectionState = buildDefenderSelectionState(displayedDefenders, stackRoster, catalog)
  const selectionGroups: DefenderStackGroup[] = []
  const consumedUnitIds = new Set<string>()

  if (projection !== null) {
    for (const rosterGroup of Object.values(projection.index.groupsById)) {
      const units = rosterGroup.unitIds
        .map((unitId) => projection.defendersById.get(unitId))
        .filter((unit): unit is BattlefieldUnit => unit !== undefined)

      if (units.length === 0) {
        continue
      }

      for (const unit of units) {
        consumedUnitIds.add(unit.unitId)
      }

      selectionGroups.push(buildDefenderGroupFromUnits(units, groupMode, activeMode, activeSelectedUnitIds, stackNaming, selectionState, catalog, combatUnitAvailabilityReasons, actionEligibility, rosterGroup.groupKey))
    }
  }

  for (const unit of displayedDefenders) {
    if (consumedUnitIds.has(unit.unitId)) {
      continue
    }

    selectionGroups.push(buildDefenderGroupFromUnits([unit], groupMode, activeMode, activeSelectedUnitIds, stackNaming, selectionState, catalog, combatUnitAvailabilityReasons, actionEligibility))
  }

  return selectionGroups
}

function resolveDisplayedStackUnits(
  units: ReadonlyArray<BattlefieldUnit>,
  activeSelectedUnitIds: readonly string[],
): BattlefieldUnit[] {
  const selectedUnitIdSet = new Set(activeSelectedUnitIds.map(resolveSelectionOwnerUnitId))
  const selectedUnits = units.filter((unit) => selectedUnitIdSet.has(unit.unitId))

  return selectedUnits.length > 0 ? selectedUnits : [...units]
}

type BattlefieldStackGroupProps = {
  activeSelectedUnitIds: readonly string[]
  activeTurnActive: boolean
  displayedDefenders: ReadonlyArray<BattlefieldUnit>
  group: DefenderStackGroup
  groupMode: 'combat' | 'move'
  isSelectionLocked: boolean
  stacksExpandable: boolean
  viewerRole: 'onion' | 'defender'
  onSelectGroup: (unitId: string, event: MouseEvent<HTMLButtonElement>) => void
  onSelectMember: (selectionId: string, event: MouseEvent<HTMLButtonElement>) => void
}

function BattlefieldStackGroup({
  activeSelectedUnitIds,
  activeTurnActive,
  displayedDefenders,
  group,
  groupMode,
  isSelectionLocked,
  stacksExpandable,
  viewerRole,
  onSelectGroup,
  onSelectMember,
}: BattlefieldStackGroupProps) {
  const isCombatGroup = groupMode === 'combat'
  const isSelected = group.selectedCount > 0
  const isActionable = activeTurnActive && viewerRole === 'defender' && group.isActionable
  const isExpanded = shouldExpandBattlefieldStackGroup({
    memberCount: group.members.length,
    selectedCount: group.selectedCount,
    stacksExpandable,
  }) && !group.isDestroyed
  return (
    <div
      key={group.anchorUnit.unitId}
      className={`combat-stack-group${isExpanded ? ' is-expanded' : ''}`}
      data-expanded={isExpanded}
      data-testid={`${groupMode}-stack-group-${group.anchorUnit.unitId}`}
    >
      <button
        type="button"
        className={[
          isCombatGroup ? 'attacker-card-button' : 'defender-card-button',
          ...(isCombatGroup ? [] : ['slim-weapon-card']),
          isSelected ? 'is-selected' : '',
          isActionable ? 'is-actionable' : '',
          isSelectionLocked ? 'is-disabled' : '',
          group.isPartiallyDestroyed
            ? 'tone-destroyed-partial'
            : group.hasDisabledUnit
              ? 'tone-dim'
              : `tone-${statusTone(group.anchorUnit.state)}`,
        ].join(' ')}
        aria-pressed={isSelected}
        disabled={isSelectionLocked}
        data-selected={isSelected}
        data-testid={`combat-unit-${group.anchorUnit.unitId}`}
        title={isCombatGroup && activeTurnActive && viewerRole === 'defender'
          ? group.isDestroyed
            ? 'Destroyed units cannot attack.'
            : !group.isActionable
              ? group.availabilityReason ?? 'This unit is not eligible to attack.'
              : undefined
          : undefined}
        onClick={(event) => {
          if (isSelectionLocked) {
            event.preventDefault()
            event.stopPropagation()
            return
          }

          event.stopPropagation()
          onSelectGroup(group.anchorUnit.unitId, event)
        }}
      >
        <div className="combat-stack-card-head">
          <div className="weapon-card-name">{group.label}</div>
          {group.members.length > 1 && !group.isDestroyed ? <span className="mini-tag">{group.attackReadyCount}/{group.members.length}</span> : null}
        </div>
        {group.isDestroyed ? (
          <div className="weapon-card-stats">Destroyed</div>
        ) : group.availabilityReason !== undefined ? (
          <div className="weapon-card-stats">{group.availabilityReason}</div>
        ) : (
          <div className="weapon-card-stats">
            {isCombatGroup
              ? <>Attack: {group.attackStrength} &nbsp;·&nbsp; Range: {group.range}</>
              : <>Move: {group.moveAllowance} &nbsp;·&nbsp; Attack: {group.attackStrength}</>}
          </div>
        )}
      </button>
      {isExpanded ? (
        <div className="combat-stack-member-list">
          {group.members.map((member) => {
            const isMemberSelected = activeSelectedUnitIds.includes(member.selectionId)
            const memberUnit = displayedDefenders.find((unit) => unit.unitId === member.selectionId)
            const memberAvailabilityReason = member.disabledReason
            const isMemberDisabled = isSelectionLocked || (isCombatGroup && activeTurnActive && viewerRole === 'defender' && memberAvailabilityReason !== undefined)
            const isMemberActionable = activeTurnActive && viewerRole === 'defender' && member.isActionable
            return (
              <button
                key={member.selectionId}
                type="button"
                className={`attacker-card-button slim-weapon-card combat-stack-member-button${isMemberSelected ? ' is-selected' : ''}${isMemberActionable ? ' is-actionable' : ''}${isMemberDisabled ? ' is-disabled' : ''}${memberAvailabilityReason === 'Destroyed' ? ' tone-destroyed' : memberUnit?.state === 'disabled' ? ' tone-dim' : ''}`}
                aria-pressed={isMemberSelected}
                disabled={isMemberDisabled}
                data-selected={isMemberSelected}
                data-testid={member.testId}
                onClick={(event) => {
                  if (isMemberDisabled) {
                    event.preventDefault()
                    event.stopPropagation()
                    return
                  }

                  event.stopPropagation()
                  onSelectMember(member.selectionId, event)
                }}
              >
                <div className="weapon-card-name">{member.label}</div>
                <div className="weapon-card-stats">{memberAvailabilityReason ?? (isCombatGroup ? 'Toggle in attack group' : 'Toggle in move group')}</div>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function BattlefieldLeftRail({
  activeCombatRole,
  activeRole,
  activeTurnActive,
  activeMode,
  activeSelectedUnitIds,
  actionEligibility,
  displayedDefenders,
  displayedOnion,
  displayedOnions = displayedOnion === null ? [] : [displayedOnion],
  isCombatPhase,
  isMovementPhase,
  isSelectionLocked,
  stacksExpandable,
  readyWeaponDetails,
  combatUnitAvailabilityReasons,
  selectedCombatAttackLabel,
  stackNaming,
  stackRoster,
  catalog,
  onSelectUnit,
}: BattlefieldLeftRailProps) {
  const viewerRole = activeRole ?? activeCombatRole ?? 'defender'
  const viewerActivity = activeTurnActive ? 'active' : 'inactive'
  const [dismissedRenderError, setDismissedRenderError] = useState<string | null>(null)

  let renderError: string | null = null
  let defenderCombatGroups: DefenderStackGroup[] = []
  let defenderMoveGroups: DefenderStackGroup[] = []
  const defenderLookupKeys = displayedDefenders.map((unit) => unit.unitId)

  try {
    defenderCombatGroups = activeCombatRole === 'defender' && isCombatPhase
      ? buildDefenderGroups(displayedDefenders, 'combat', activeMode, activeSelectedUnitIds, stackNaming, stackRoster, catalog, combatUnitAvailabilityReasons, actionEligibility)
      : []
    defenderMoveGroups = activeCombatRole === 'defender' && isMovementPhase
      ? buildDefenderGroups(displayedDefenders, 'move', activeMode, activeSelectedUnitIds, stackNaming, stackRoster, catalog, combatUnitAvailabilityReasons, actionEligibility)
      : []
  } catch (error) {
    renderError = buildRenderErrorMessage(error, {
      activeCombatRole,
      activeMode,
      activeSelectedUnitIds,
      displayedDefenders,
      isCombatPhase,
      isMovementPhase,
      stackRoster,
    })
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : null,
        renderError,
        defenderLookupKeys,
      },
      'Battlefield left rail render mismatch',
    )
  }

  function routeSourceSelection(request: InteractionRoutingRequest, unitId: string, additive: boolean) {
    const decision = routeInteraction(request, (trace) => {
      logger.debug('[interaction-debug] left rail routed', {
        ts: Date.now(),
        ...trace,
      })
    })
    if (decision.intent === 'noop') {
      return
    }

    onSelectUnit(unitId, additive || decision.intent === 'toggle-actor')
  }

  const visibleRenderError = renderError !== null && renderError !== dismissedRenderError ? renderError : null

  return (
    <aside className="panel rail rail-left">
      {visibleRenderError !== null ? (
        <ErrorOverlay
          message={visibleRenderError}
          placement="app"
          onDismiss={() => setDismissedRenderError(visibleRenderError)}
        />
      ) : null}
      {isCombatPhase ? (
        <section className="section-block combat-scaffold">
          <div className="card-head">
            <div>
              <p className="eyebrow">Combat</p>
              <h2
                title={activeCombatRole === 'onion'
                  ? 'Pick one or more eligible weapons from the rail. Ctrl+click adds or removes weapons from the attack group.'
                  : 'Pick one or more eligible units from the rail or board. Ctrl+click adds or removes units from the attack group.'
                }
              >
                Attacker Selection
              </h2>
                    <p className="summary-line">{selectedCombatAttackLabel}</p>
            </div>
          </div>

          <div className="attacker-selection-list">
            {activeCombatRole === 'onion' ? (
              readyWeaponDetails.length > 0 ? (
                readyWeaponDetails.map((weapon) => {
                  const selectionId = buildWeaponSelectionId(weapon.id)
                  const isSelected = activeSelectedUnitIds.includes(selectionId)
                  const projectedEligibility = actionEligibility?.onionCombatByWeaponId[weapon.id]?.eligibility
                  const isWeaponActionable = projectedEligibility?.eligible ?? weapon.disabledReason === undefined
                  const projectedDisabledReason = projectedEligibility === undefined || projectedEligibility.eligible
                    ? undefined
                    : formatEligibilityReason(projectedEligibility.reason)
                  const weaponDisabledReason = projectedEligibility === undefined
                    ? weapon.disabledReason
                    : projectedDisabledReason
                  const isWeaponDisabled = isSelectionLocked || !isWeaponActionable
                  const isActionable = activeTurnActive && viewerRole === 'onion' && isWeaponActionable
                  return (
                    <button
                      key={weapon.id}
                      type="button"
                      className={`attacker-card-button slim-weapon-card${isSelected ? ' is-selected' : ''}${isActionable ? ' is-actionable' : ''}${isWeaponDisabled ? ' is-disabled' : ''}${weapon.state === 'destroyed' ? ' tone-destroyed' : ''}`}
                      aria-pressed={isSelected}
                      disabled={isWeaponDisabled}
                      title={weaponDisabledReason}
                      data-selected={isSelected}
                      data-testid={`combat-weapon-${weapon.id}`}
                      onClick={(event) => {
                        if (isWeaponDisabled) {
                          event.preventDefault()
                          event.stopPropagation()
                          return
                        }

                        event.stopPropagation()
                        routeSourceSelection(
                          {
                            viewerRole,
                            viewerActivity,
                            phaseMode: isCombatPhase ? 'combat' : isMovementPhase ? 'movement' : 'locked',
                            surface: 'left-rail',
                            gesture: event.ctrlKey || event.metaKey ? 'primary-additive' : 'primary',
                            subjectRelation: viewerRole === 'onion' ? 'self' : 'opponent',
                            subjectKind: 'weapon',
                            subjectCapability: {
                              inspectable: true,
                              moveEligible: false,
                              attackerEligible: isActionable,
                              targetEligible: false,
                            },
                          },
                          selectionId,
                          event.ctrlKey || event.metaKey,
                        )
                      }}
                    >
                      <div className="weapon-card-name">{resolveBattlefieldWeaponName(weapon, catalog)}</div>
                      <div className="weapon-card-stats">{weaponDisabledReason ?? <>Attack: {getBattlefieldWeaponAttack(weapon, catalog)} &nbsp;·&nbsp; Range: {catalog === undefined ? 0 : getSessionWeaponType(catalog, weapon.typeId).range}</>}</div>
                    </button>
                  )
                })
              ) : (
                <p className="summary-line">No ready weapons available.</p>
              )
            ) : defenderCombatGroups.length > 0 ? (
              <div data-testid="battlefield-left-rail-combat-groups">
                {defenderCombatGroups.map((group) => (
                  <BattlefieldStackGroup
                    key={group.anchorUnit.unitId}
                    activeSelectedUnitIds={activeSelectedUnitIds}
                    activeTurnActive={activeTurnActive}
                    displayedDefenders={displayedDefenders}
                    group={group}
                    groupMode="combat"
                    isSelectionLocked={isSelectionLocked}
                    stacksExpandable={stacksExpandable}
                    viewerRole={viewerRole}
                    onSelectGroup={(unitId, event) => {
                      const isAdditive = event.ctrlKey || event.metaKey
                      routeSourceSelection(
                        {
                          viewerRole,
                          viewerActivity,
                          phaseMode: isCombatPhase ? 'combat' : isMovementPhase ? 'movement' : 'locked',
                          surface: 'left-rail',
                          gesture: isAdditive ? 'primary-additive' : 'primary',
                          subjectRelation: viewerRole === 'defender' ? 'self' : 'opponent',
                          subjectKind: 'stack',
                          subjectCapability: {
                            inspectable: true,
                            moveEligible: false,
                            attackerEligible: activeTurnActive && viewerRole === 'defender' && group.isActionable,
                            targetEligible: false,
                          },
                        },
                        unitId,
                        isAdditive,
                      )
                    }}
                    onSelectMember={(selectionId) => {
                      const isMemberActionable = group.members.find((member) => member.selectionId === selectionId)?.isActionable === true
                      routeSourceSelection(
                        {
                          viewerRole,
                          viewerActivity,
                          phaseMode: isCombatPhase ? 'combat' : isMovementPhase ? 'movement' : 'locked',
                          surface: 'left-rail',
                          gesture: 'primary-additive',
                          subjectRelation: viewerRole === 'defender' ? 'self' : 'opponent',
                          subjectKind: 'stack',
                          subjectCapability: {
                            inspectable: true,
                            moveEligible: false,
                            attackerEligible: activeTurnActive && viewerRole === 'defender' && isMemberActionable,
                            targetEligible: false,
                          },
                        },
                        selectionId,
                        true,
                      )
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="summary-line">Waiting for battlefield data.</p>
            )}
          </div>
        </section>
      ) : isMovementPhase ? (
        activeCombatRole === 'onion' ? (
          <section className="section-block">
            <div className="card-head">
              <div>
                <p className="eyebrow">Onion</p>
              </div>
            </div>
            {displayedOnions.length > 0 ? displayedOnions.map((onion) => {
              const movementEligibility = actionEligibility?.movementByUnitId[onion.unitId]
              const isActionable = activeTurnActive && viewerRole === 'onion' && movementEligibility?.eligible === true
              return (
              <button
                key={onion.unitId}
                type="button"
                className={`onion-card-button ${activeSelectedUnitIds.includes(onion.unitId) ? 'is-selected' : ''}${isActionable ? ' is-actionable' : ''}`}
                aria-pressed={activeSelectedUnitIds.includes(onion.unitId)}
                disabled={isSelectionLocked}
                data-selected={activeSelectedUnitIds.includes(onion.unitId)}
                data-testid={`combat-unit-${onion.unitId}`}
                onClick={(event) => {
                  if (isSelectionLocked) {
                    event.preventDefault()
                    event.stopPropagation()
                    return
                  }

                  event.stopPropagation()
                  routeSourceSelection(
                    {
                      viewerRole,
                      viewerActivity,
                      phaseMode: isCombatPhase ? 'combat' : isMovementPhase ? 'movement' : 'locked',
                      surface: 'left-rail',
                      gesture: event.ctrlKey || event.metaKey ? 'primary-additive' : 'primary',
                      subjectRelation: viewerRole === 'onion' ? 'self' : 'opponent',
                      subjectKind: 'unit',
                      subjectCapability: {
                        inspectable: true,
                        moveEligible: activeTurnActive && viewerRole === 'onion',
                        attackerEligible: false,
                        targetEligible: false,
                      },
                    },
                    onion.unitId,
                    event.ctrlKey || event.metaKey,
                  )
                }}
              >
                <h3>{resolveBattlefieldUnitName(onion.typeId, onion.unitId, onion.friendlyName)}</h3>
                <div className="unit-summary">
                  <div className="summary-line">
                    <span>Treads <strong>{onion.treads}</strong></span>
                    <span>Moves <strong>{onion.movesRemaining}</strong></span>
                    <span>Rams remaining <strong>{onion.ramsRemaining}</strong></span>
                  </div>
                  <div className="summary-line">
                    <span>Weapons <strong>{parseWeaponStats(onion.weapons).operationalWeapons}</strong></span>
                    <span>Missile weapons <strong>{parseWeaponStats(onion.weapons).operationalMissiles}</strong></span>
                  </div>
                </div>
              </button>
              )
            }) : (
              <p className="summary-line">Waiting for battlefield data.</p>
            )}
          </section>
        ) : activeCombatRole === 'defender' ? (
          <section className="section-block">
            <div className="card-head">
              <p className="eyebrow">Defenders</p>
              <span className="mini-tag">{displayedDefenders.length} tracked</span>
            </div>
            {defenderMoveGroups.length > 0 ? (
              <div className="defender-list" data-testid="battlefield-left-rail-move-groups">
                {defenderMoveGroups.map((group) => (
                  <BattlefieldStackGroup
                    key={group.anchorUnit.unitId}
                    activeSelectedUnitIds={activeSelectedUnitIds}
                    activeTurnActive={activeTurnActive}
                    displayedDefenders={displayedDefenders}
                    group={group}
                    groupMode="move"
                    isSelectionLocked={isSelectionLocked}
                    stacksExpandable={stacksExpandable}
                    viewerRole={viewerRole}
                    onSelectGroup={(unitId, event) => {
                      const isAdditive = event.ctrlKey || event.metaKey
                      routeSourceSelection(
                        {
                          viewerRole,
                          viewerActivity,
                          phaseMode: isCombatPhase ? 'combat' : isMovementPhase ? 'movement' : 'locked',
                          surface: 'left-rail',
                          gesture: isAdditive ? 'primary-additive' : 'primary',
                          subjectRelation: viewerRole === 'defender' ? 'self' : 'opponent',
                          subjectKind: 'stack',
                          subjectCapability: {
                            inspectable: true,
                            moveEligible: activeTurnActive && viewerRole === 'defender' && group.isActionable,
                            attackerEligible: false,
                            targetEligible: false,
                          },
                        },
                        unitId,
                        isAdditive,
                      )
                    }}
                    onSelectMember={(selectionId) => {
                      const isMemberActionable = group.members.find((member) => member.selectionId === selectionId)?.isActionable === true
                      routeSourceSelection(
                        {
                          viewerRole,
                          viewerActivity,
                          phaseMode: isCombatPhase ? 'combat' : isMovementPhase ? 'movement' : 'locked',
                          surface: 'left-rail',
                          gesture: 'primary-additive',
                          subjectRelation: viewerRole === 'defender' ? 'self' : 'opponent',
                          subjectKind: 'stack',
                          subjectCapability: {
                            inspectable: true,
                            moveEligible: activeTurnActive && viewerRole === 'defender' && isMemberActionable,
                            attackerEligible: false,
                            targetEligible: false,
                          },
                        },
                        selectionId,
                        true,
                      )
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="summary-line">Waiting for battlefield data.</p>
            )}
          </section>
        ) : null
      ) : null}
    </aside>
  )
}
