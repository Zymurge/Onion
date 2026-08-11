import { useState, type MouseEvent } from 'react'
import { getBattlefieldPosition, statusTone, type BattlefieldOnionView, type BattlefieldUnit, type Mode } from '../lib/battlefieldView'
import {
  buildStackMemberSelectionId,
  buildWeaponSelectionId,
  resolveSelectionOwnerUnitId,
} from '../lib/selectionIds'
import { countSelectedBattlefieldStackMembers, shouldExpandBattlefieldStackGroup, type WebStackSourceState } from '../lib/stackSelection'
import { getBattlefieldStackSize, resolveBattlefieldDisplayName, resolveBattlefieldStackLabel, resolveBattlefieldUnitName } from '../lib/battlefieldNaming'
import { getBattlefieldWeaponAttack, isBattlefieldWeaponReady, parseAttackStats, parseRangeValue, parseWeaponStats, resolveBattlefieldWeaponName } from '../lib/weaponStats'
import type { StackNamingSnapshot } from '../../shared/stackNaming'
import { buildStackRosterIndex } from '../../shared/stackRoster'
import type { DefenderMap, StackRosterState, Weapon } from '../../shared/types/index'
import { getSessionWeaponType, type SessionCatalog } from '../lib/sessionCatalog'
import { routeInteraction, type InteractionRoutingRequest } from '../lib/interactionRouting'
import logger from '../lib/logger'
import { ErrorOverlay } from './ErrorOverlay'

type BattlefieldLeftRailProps = {
  activeCombatRole: 'onion' | 'defender' | null
  activeRole: 'onion' | 'defender' | null
  activeTurnActive: boolean
  activeMode: Mode
  activeSelectedUnitIds: string[]
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
  readyWeaponDetails: ReadonlyArray<Weapon>
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
}

type DefenderStackGroup = {
  anchorUnit: BattlefieldUnit
  attackStrength: number
  attackReadyCount: number
  isActionable: boolean
  isDestroyed: boolean
  label: string
  members: DefenderStackGroupMember[]
  range: number
  moveAllowance: number
  selectedCount: number
}

function buildDefenderLookup(units: ReadonlyArray<BattlefieldUnit>): DefenderMap {
  return Object.fromEntries(
    units.map((unit) => [unit.id, {
      role: 'defender' as const,
      unitId: unit.unitId,
      typeId: unit.typeId,
      state: unit.state,
      friendlyName: unit.friendlyName,
      position: getBattlefieldPosition(unit),
      weapons: unit.weaponDetails ?? (Array.isArray(unit.weapons) ? unit.weapons : []),
      targetRules: unit.targetRules,
      squads: unit.squads,
    }]),
  )
}

function buildDefenderSelectionState(
  displayedDefenders: ReadonlyArray<BattlefieldUnit>,
  stackRoster: StackRosterState | undefined,
  catalog: SessionCatalog | undefined,
): WebStackSourceState {
  return {
    defenders: Object.fromEntries(
      displayedDefenders.map((unit) => [unit.id, {
        unitId: unit.unitId ?? unit.id,
        typeId: unit.typeId ?? unit.type,
        position: getBattlefieldPosition(unit),
        state: unit.state ?? unit.status,
        squads: unit.squads,
      }]),
    ),
    ...(stackRoster === undefined ? {} : { stackRoster }),
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
  const displayedDefenderIds = context.displayedDefenders.map((unit) => unit.id).join(', ') || 'none'
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
  groupKey?: string,
): DefenderStackGroup {
  const anchorUnit = units[0]
  const baseAttackStats = parseAttackStats(anchorUnit.attack)
  const stackSize = units.length > 1 ? units.length : getBattlefieldStackSize(anchorUnit)
  const displayedUnits = resolveDisplayedStackUnits(units, activeSelectedUnitIds)
  const resolvedGroupKey = units.length > 1 ? groupKey : undefined
  const label = resolvedGroupKey !== undefined
    ? resolveBattlefieldStackLabel(anchorUnit.type, anchorUnit.id, anchorUnit.friendlyName, stackSize, resolvedGroupKey, stackNaming)
    : resolveBattlefieldDisplayName({
      id: anchorUnit.id,
      type: anchorUnit.type,
      position: getBattlefieldPosition(anchorUnit),
      friendlyName: anchorUnit.friendlyName,
      squads: stackSize,
    }, stackNaming)
  const selectedCount = countSelectedBattlefieldStackMembers(selectionState, anchorUnit.id, activeSelectedUnitIds)
  const attackReadyCount = displayedUnits.filter((unit) => getReadyUnitAttackStrength(unit, catalog) > 0).length
  const members = units.length > 1
    ? units.map((unit) => ({
      selectionId: unit.id,
      testId: `combat-stack-member-${unit.id}`,
      label: resolveBattlefieldUnitName(unit.type, unit.id, unit.friendlyName),
    }))
    : stackSize > 1
      ? Array.from({ length: stackSize }, (_, index) => ({
        selectionId: buildStackMemberSelectionId(anchorUnit.id, index + 1),
        testId: `combat-stack-member-${anchorUnit.id}-${index + 1}`,
        label: resolveBattlefieldUnitName(anchorUnit.type, anchorUnit.id, anchorUnit.friendlyName),
      }))
      : []

  return {
    anchorUnit,
    attackStrength: displayedUnits.reduce((total, unit) => total + getReadyUnitAttackStrength(unit, catalog), 0),
    attackReadyCount,
      isActionable: groupMode === 'combat' && units.some((unit) => unit.actionableModes.includes(activeMode)),
      isDestroyed: groupMode === 'combat'
        ? units.every((unit) => unit.status === 'destroyed')
        : anchorUnit.status === 'destroyed',
    label,
    members,
      range: groupMode === 'combat' ? parseRangeValue(baseAttackStats.range) : 0,
      moveAllowance: groupMode === 'move' ? Math.max(...units.map((unit) => unit.move)) : 0,
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
): DefenderStackGroup[] {
  const rosterIndex = stackRoster !== undefined
    ? buildStackRosterIndex(stackRoster, buildDefenderLookup(displayedDefenders))
    : null
  const selectionState = buildDefenderSelectionState(displayedDefenders, stackRoster, catalog)
  const selectionGroups: DefenderStackGroup[] = []
  const consumedUnitIds = new Set<string>()

  if (rosterIndex !== null) {
    for (const rosterGroup of Object.values(rosterIndex.groupsById)) {
      const units = rosterGroup.unitIds
        .map((unitId) => displayedDefenders.find((unit) => unit.id === unitId))
        .filter((unit): unit is BattlefieldUnit => unit !== undefined)

      if (units.length === 0) {
        continue
      }

      for (const unit of units) {
        consumedUnitIds.add(unit.id)
      }

      selectionGroups.push(buildDefenderGroupFromUnits(units, groupMode, activeMode, activeSelectedUnitIds, stackNaming, selectionState, catalog, rosterGroup.groupKey))
    }
  }

  for (const unit of displayedDefenders) {
    if (consumedUnitIds.has(unit.id)) {
      continue
    }

    selectionGroups.push(buildDefenderGroupFromUnits([unit], groupMode, activeMode, activeSelectedUnitIds, stackNaming, selectionState, catalog))
  }

  return selectionGroups
}

function getReadyUnitAttackStrength(unit: BattlefieldUnit, catalog?: SessionCatalog): number {
  if (unit.weaponDetails !== undefined && unit.weaponDetails.length > 0) {
    return unit.weaponDetails
      .filter(isBattlefieldWeaponReady)
      .reduce((total, weapon) => total + getBattlefieldWeaponAttack(weapon, catalog), 0)
  }

  return parseRangeValue(parseAttackStats(unit.attack).damage)
}

function resolveDisplayedStackUnits(
  units: ReadonlyArray<BattlefieldUnit>,
  activeSelectedUnitIds: readonly string[],
): BattlefieldUnit[] {
  const selectedUnitIdSet = new Set(activeSelectedUnitIds.map(resolveSelectionOwnerUnitId))
  const selectedUnits = units.filter((unit) => selectedUnitIdSet.has(unit.id))

  return selectedUnits.length > 0 ? selectedUnits : [...units]
}

type BattlefieldStackGroupProps = {
  activeMode: Mode
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
  activeMode,
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
  const isActionable = isCombatGroup
    ? activeTurnActive && viewerRole === 'defender' && group.isActionable
    : activeTurnActive && viewerRole === 'defender' && !group.isDestroyed
  const isExpanded = shouldExpandBattlefieldStackGroup({
    memberCount: group.members.length,
    selectedCount: group.selectedCount,
    stacksExpandable,
  })
  return (
    <div
      key={group.anchorUnit.id}
      className={`combat-stack-group${isExpanded ? ' is-expanded' : ''}`}
      data-expanded={isExpanded}
      data-testid={`${groupMode}-stack-group-${group.anchorUnit.id}`}
    >
      <button
        type="button"
        className={[
          isCombatGroup ? 'attacker-card-button' : 'defender-card-button',
          ...(isCombatGroup ? [] : ['slim-weapon-card']),
          isSelected ? 'is-selected' : '',
          isActionable ? 'is-actionable' : '',
          isSelectionLocked ? 'is-disabled' : '',
          `tone-${statusTone(group.anchorUnit.status)}`,
        ].join(' ')}
        aria-pressed={isSelected}
        disabled={isSelectionLocked}
        data-selected={isSelected}
        data-testid={`combat-unit-${group.anchorUnit.id}`}
        title={isCombatGroup && activeTurnActive && viewerRole === 'defender'
          ? group.isDestroyed
            ? 'Destroyed units cannot attack.'
            : !group.isActionable
              ? 'This unit is not eligible to attack.'
              : undefined
          : undefined}
        onClick={(event) => {
          if (isSelectionLocked) {
            event.preventDefault()
            event.stopPropagation()
            return
          }

          event.stopPropagation()
          onSelectGroup(group.anchorUnit.id, event)
        }}
      >
        <div className="combat-stack-card-head">
          <div className="weapon-card-name">{group.label}</div>
          {group.members.length > 1 ? <span className="mini-tag">{group.attackReadyCount}/{group.members.length}</span> : null}
        </div>
        <div className="weapon-card-stats">
          {isCombatGroup
            ? <>Attack: {group.attackStrength} &nbsp;·&nbsp; Range: {group.range}</>
            : <>Move: {group.moveAllowance} &nbsp;·&nbsp; Attack: {group.attackStrength}</>}
        </div>
      </button>
      {isExpanded ? (
        <div className="combat-stack-member-list">
          {group.members.map((member) => {
            const isMemberSelected = activeSelectedUnitIds.includes(member.selectionId)
            const memberUnit = isCombatGroup ? displayedDefenders.find((unit) => unit.id === member.selectionId) : undefined
            const isMemberActionable = memberUnit?.actionableModes.includes(activeMode) === true
            const isMemberDisabled = isSelectionLocked || (isCombatGroup && activeTurnActive && viewerRole === 'defender' && !isMemberActionable)
            return (
              <button
                key={member.selectionId}
                type="button"
                className={`attacker-card-button slim-weapon-card combat-stack-member-button${isMemberSelected ? ' is-selected' : ''}${isMemberDisabled ? ' is-disabled' : ''}`}
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
                <div className="weapon-card-stats">{isCombatGroup ? 'Toggle in attack group' : 'Toggle in move group'}</div>
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
  displayedDefenders,
  displayedOnion,
  displayedOnions = displayedOnion === null ? [] : [displayedOnion],
  isCombatPhase,
  isMovementPhase,
  isSelectionLocked,
  stacksExpandable,
  readyWeaponDetails,
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
  const defenderLookup = buildDefenderLookup(displayedDefenders)
  const defenderLookupKeys = Object.keys(defenderLookup)

  try {
    defenderCombatGroups = activeCombatRole === 'defender' && isCombatPhase
      ? buildDefenderGroups(displayedDefenders, 'combat', activeMode, activeSelectedUnitIds, stackNaming, stackRoster, catalog)
      : []
    defenderMoveGroups = activeCombatRole === 'defender' && isMovementPhase
      ? buildDefenderGroups(displayedDefenders, 'move', activeMode, activeSelectedUnitIds, stackNaming, stackRoster, catalog)
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
                  return (
                    <button
                      key={weapon.id}
                      type="button"
                      className={`attacker-card-button slim-weapon-card${isSelected ? ' is-selected' : ''}`}
                      aria-pressed={isSelected}
                      disabled={isSelectionLocked}
                      data-selected={isSelected}
                      data-testid={`combat-weapon-${weapon.id}`}
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
                            subjectKind: 'weapon',
                            subjectCapability: {
                              inspectable: true,
                              moveEligible: false,
                              attackerEligible: activeTurnActive && viewerRole === 'onion',
                              targetEligible: false,
                            },
                          },
                          selectionId,
                          event.ctrlKey || event.metaKey,
                        )
                      }}
                    >
                      <div className="weapon-card-name">{resolveBattlefieldWeaponName(weapon, catalog)}</div>
                      <div className="weapon-card-stats">Attack: {getBattlefieldWeaponAttack(weapon, catalog)} &nbsp;·&nbsp; Range: {catalog === undefined ? 0 : getSessionWeaponType(catalog, weapon.typeId).range}</div>
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
                    key={group.anchorUnit.id}
                    activeMode={activeMode}
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
                      const memberUnit = displayedDefenders.find((unit) => unit.id === selectionId)
                      const isMemberActionable = memberUnit?.actionableModes.includes(activeMode) === true
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
            {displayedOnions.length > 0 ? displayedOnions.map((onion) => (
              <button
                key={onion.id}
                type="button"
                className={`onion-card-button ${activeSelectedUnitIds.includes(onion.id) ? 'is-selected' : ''}`}
                aria-pressed={activeSelectedUnitIds.includes(onion.id)}
                disabled={isSelectionLocked}
                data-selected={activeSelectedUnitIds.includes(onion.id)}
                data-testid={`combat-unit-${onion.id}`}
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
                    onion.id,
                    event.ctrlKey || event.metaKey,
                  )
                }}
              >
                <h3>{resolveBattlefieldUnitName(onion.type, onion.id, onion.friendlyName)}</h3>
                <div className="unit-summary">
                  <div className="summary-line">
                    <span>Treads <strong>{onion.treads}</strong></span>
                    <span>Moves <strong>{onion.movesRemaining}</strong></span>
                    <span>Rams remaining <strong>{onion.rams}</strong></span>
                  </div>
                  <div className="summary-line">
                    <span>Weapons <strong>{parseWeaponStats(onion.weaponDetails ?? []).operationalWeapons}</strong></span>
                    <span>Missile weapons <strong>{parseWeaponStats(onion.weaponDetails ?? []).operationalMissiles}</strong></span>
                  </div>
                </div>
              </button>
            )) : (
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
                    key={group.anchorUnit.id}
                    activeMode={activeMode}
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
                            moveEligible: activeTurnActive && viewerRole === 'defender' && !group.isDestroyed,
                            attackerEligible: false,
                            targetEligible: false,
                          },
                        },
                        unitId,
                        isAdditive,
                      )
                    }}
                    onSelectMember={(selectionId) => {
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
                            moveEligible: activeTurnActive && viewerRole === 'defender' && !group.isDestroyed,
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
