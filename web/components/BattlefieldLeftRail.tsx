import { statusTone, type BattlefieldOnionView, type BattlefieldUnit, type Mode } from '../lib/battlefieldView'
import {
  buildStackMemberSelectionId,
  buildWeaponSelectionId,
  countSelectedBattlefieldStackMembers,
  getBattlefieldStackSize,
  parseAttackStats,
  parseRangeValue,
  resolveSelectionOwnerUnitId,
  resolveBattlefieldDisplayName,
  resolveBattlefieldStackLabel,
  resolveBattlefieldUnitName,
  resolveBattlefieldWeaponName,
  shouldExpandBattlefieldStackGroup,
} from '../lib/appViewHelpers'
import type { StackNamingSnapshot } from '../../shared/stackNaming'
import { buildStackRosterIndex } from '../../shared/stackRoster'
import type { StackRosterState, Weapon } from '../../shared/types/index'
import { routeInteraction, type InteractionRoutingRequest } from '../lib/interactionRouting'
import logger from '../lib/logger'

type BattlefieldLeftRailProps = {
  activeCombatRole: 'onion' | 'defender' | null
  activeRole: 'onion' | 'defender' | null
  activeTurnActive: boolean
  activeMode: Mode
  activeSelectedUnitIds: string[]
  displayedDefenders: ReadonlyArray<BattlefieldUnit>
  displayedOnion: BattlefieldOnionView | null
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
  onSelectUnit: (unitId: string, additive?: boolean) => void
}

type DefenderCombatGroupMember = {
  selectionId: string
  testId: string
  label: string
}

type DefenderCombatGroup = {
  anchorUnit: BattlefieldUnit
  attackStrength: number
  attackReadyCount: number
  isActionable: boolean
  isDestroyed: boolean
  label: string
  members: DefenderCombatGroupMember[]
  range: number
  selectedCount: number
}

type DefenderMoveGroupMember = {
  selectionId: string
  testId: string
  label: string
}

type DefenderMoveGroup = {
  anchorUnit: BattlefieldUnit
  attackStrength: number
  attackReadyCount: number
  isDestroyed: boolean
  label: string
  members: DefenderMoveGroupMember[]
  moveAllowance: number
  selectedCount: number
}

function buildCombatGroupFromUnits(
  units: ReadonlyArray<BattlefieldUnit>,
  activeMode: Mode,
  activeSelectedUnitIds: readonly string[],
  stackNaming: StackNamingSnapshot | undefined,
  stackRoster: StackRosterState | undefined,
  groupKey?: string,
): DefenderCombatGroup {
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
      q: anchorUnit.q,
      r: anchorUnit.r,
      friendlyName: anchorUnit.friendlyName,
      squads: stackSize,
    }, stackNaming)
  const selectionState = {
    defenders: Object.fromEntries(
      units.map((unit) => [unit.id, {
        id: unit.id,
        type: unit.type,
        position: { q: unit.q, r: unit.r },
        status: unit.status,
        squads: unit.squads,
      }]),
    ),
    ...(stackRoster === undefined ? {} : { stackRoster }),
  }
  const selectedCount = countSelectedBattlefieldStackMembers(selectionState as any, anchorUnit.id, activeSelectedUnitIds)
  const attackReadyCount = displayedUnits.filter((unit) => getReadyUnitAttackStrength(unit) > 0).length
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
    attackStrength: displayedUnits.reduce((total, unit) => total + getReadyUnitAttackStrength(unit), 0),
    attackReadyCount,
    isActionable: units.some((unit) => unit.actionableModes.includes(activeMode)),
    isDestroyed: units.every((unit) => unit.status === 'destroyed'),
    label,
    members,
    range: parseRangeValue(baseAttackStats.range),
    selectedCount,
  }
}

function buildDefenderCombatGroups(
  displayedDefenders: ReadonlyArray<BattlefieldUnit>,
  activeMode: Mode,
  activeSelectedUnitIds: string[],
  stackNaming: StackNamingSnapshot | undefined,
  stackRoster: StackRosterState | undefined,
): DefenderCombatGroup[] {
  const rosterIndex = stackRoster !== undefined ? buildStackRosterIndex(stackRoster) : null
  const selectionGroups: DefenderCombatGroup[] = []
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

      selectionGroups.push(buildCombatGroupFromUnits(units, activeMode, activeSelectedUnitIds, stackNaming, stackRoster, rosterGroup.groupKey))
    }
  }

  for (const unit of displayedDefenders) {
    if (consumedUnitIds.has(unit.id)) {
      continue
    }

    selectionGroups.push(buildCombatGroupFromUnits([unit], activeMode, activeSelectedUnitIds, stackNaming, stackRoster))
  }

  return selectionGroups
}

function buildMoveGroupFromUnits(
  units: ReadonlyArray<BattlefieldUnit>,
  activeSelectedUnitIds: readonly string[],
  stackNaming: StackNamingSnapshot | undefined,
  stackRoster: StackRosterState | undefined,
  groupKey?: string,
): DefenderMoveGroup {
  const anchorUnit = units[0]
  const stackSize = units.length > 1 ? units.length : getBattlefieldStackSize(anchorUnit)
  const displayedUnits = resolveDisplayedStackUnits(units, activeSelectedUnitIds)
  const resolvedGroupKey = units.length > 1 ? groupKey : undefined
  const label = resolvedGroupKey !== undefined
    ? resolveBattlefieldStackLabel(anchorUnit.type, anchorUnit.id, anchorUnit.friendlyName, stackSize, resolvedGroupKey, stackNaming)
    : resolveBattlefieldDisplayName({
      id: anchorUnit.id,
      type: anchorUnit.type,
      q: anchorUnit.q,
      r: anchorUnit.r,
      friendlyName: anchorUnit.friendlyName,
      squads: stackSize,
    }, stackNaming)
  const selectionState = {
    defenders: Object.fromEntries(
      units.map((unit) => [unit.id, {
        id: unit.id,
        type: unit.type,
        position: { q: unit.q, r: unit.r },
        status: unit.status,
        squads: unit.squads,
      }]),
    ),
    ...(stackRoster === undefined ? {} : { stackRoster }),
  }
  const selectedCount = countSelectedBattlefieldStackMembers(selectionState as any, anchorUnit.id, activeSelectedUnitIds)
  const attackReadyCount = displayedUnits.filter((unit) => getReadyUnitAttackStrength(unit) > 0).length
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
    attackStrength: displayedUnits.reduce((total, unit) => total + getReadyUnitAttackStrength(unit), 0),
    attackReadyCount,
    isDestroyed: anchorUnit.status === 'destroyed',
    label,
    members,
    moveAllowance: Math.max(...units.map((unit) => unit.move)),
    selectedCount,
  }
}

function getReadyUnitAttackStrength(unit: BattlefieldUnit): number {
  if (unit.weaponDetails !== undefined && unit.weaponDetails.length > 0) {
    return unit.weaponDetails
      .filter((weapon) => weapon.status === 'ready')
      .reduce((total, weapon) => total + weapon.attack, 0)
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

function buildDefenderMoveGroups(
  displayedDefenders: ReadonlyArray<BattlefieldUnit>,
  activeSelectedUnitIds: string[],
  stackNaming: StackNamingSnapshot | undefined,
  stackRoster: StackRosterState | undefined,
): DefenderMoveGroup[] {
  const rosterIndex = stackRoster !== undefined ? buildStackRosterIndex(stackRoster) : null
  const selectionGroups: DefenderMoveGroup[] = []
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

      selectionGroups.push(buildMoveGroupFromUnits(units, activeSelectedUnitIds, stackNaming, stackRoster, rosterGroup.groupKey))
    }
  }

  for (const unit of displayedDefenders) {
    if (consumedUnitIds.has(unit.id)) {
      continue
    }

    selectionGroups.push(buildMoveGroupFromUnits([unit], activeSelectedUnitIds, stackNaming, stackRoster))
  }

  return selectionGroups
}

export function BattlefieldLeftRail({
  activeCombatRole,
  activeRole,
  activeTurnActive,
  activeMode,
  activeSelectedUnitIds,
  displayedDefenders,
  displayedOnion,
  isCombatPhase,
  isMovementPhase,
  isSelectionLocked,
  stacksExpandable,
  onionWeapons,
  readyWeaponDetails,
  selectedCombatAttackLabel,
  stackNaming,
  stackRoster,
  onSelectUnit,
}: BattlefieldLeftRailProps) {
  const viewerRole = activeRole ?? activeCombatRole ?? 'defender'
  const viewerActivity = activeTurnActive ? 'active' : 'inactive'

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

  const defenderCombatGroups = activeCombatRole === 'defender' && isCombatPhase
    ? buildDefenderCombatGroups(displayedDefenders, activeMode, activeSelectedUnitIds, stackNaming, stackRoster)
    : []
  const defenderMoveGroups = activeCombatRole === 'defender' && isMovementPhase
    ? buildDefenderMoveGroups(displayedDefenders, activeSelectedUnitIds, stackNaming, stackRoster)
    : []

  return (
    <aside className="panel rail rail-left">
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
                      <div className="weapon-card-name">{resolveBattlefieldWeaponName(weapon)}</div>
                      <div className="weapon-card-stats">Attack: {weapon.attack} &nbsp;·&nbsp; Range: {weapon.range}</div>
                    </button>
                  )
                })
              ) : (
                <p className="summary-line">No ready weapons available.</p>
              )
            ) : defenderCombatGroups.length > 0 ? (
              defenderCombatGroups.map((group) => {
                const isSelected = group.selectedCount > 0
                const isCombatActionable = activeTurnActive && viewerRole === 'defender' && group.isActionable
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
                    data-testid={`combat-stack-group-${group.anchorUnit.id}`}
                  >
                    <button
                      type="button"
                      className={[
                        'attacker-card-button',
                        isSelected ? 'is-selected' : '',
                        isCombatActionable ? 'is-actionable' : '',
                        isSelectionLocked ? 'is-disabled' : '',
                        `tone-${statusTone(group.anchorUnit.status)}`,
                      ].join(' ')}
                      aria-pressed={isSelected}
                      disabled={isSelectionLocked}
                      data-selected={isSelected}
                      data-testid={`combat-unit-${group.anchorUnit.id}`}
                      title={
                        activeTurnActive && viewerRole === 'defender'
                          ? group.isDestroyed
                            ? 'Destroyed units cannot attack.'
                            : !group.isActionable
                              ? 'This unit is not eligible to attack.'
                              : undefined
                          : undefined
                      }
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
                            subjectRelation: viewerRole === 'defender' ? 'self' : 'opponent',
                            subjectKind: 'stack',
                            subjectCapability: {
                              inspectable: true,
                              moveEligible: false,
                              attackerEligible: isCombatActionable,
                              targetEligible: false,
                            },
                          },
                          group.anchorUnit.id,
                          event.ctrlKey || event.metaKey,
                        )
                      }}
                    >
                      <div className="combat-stack-card-head">
                        <div className="weapon-card-name">{group.label}</div>
                        {group.members.length > 1 ? <span className="mini-tag">{group.attackReadyCount}/{group.members.length}</span> : null}
                      </div>
                      <div className="weapon-card-stats">Attack: {group.attackStrength} &nbsp;·&nbsp; Range: {group.range}</div>
                    </button>
                    {isExpanded ? (
                      <div className="combat-stack-member-list">
                        {group.members.map((member) => {
                          const isMemberSelected = activeSelectedUnitIds.includes(member.selectionId)
                          const memberUnit = displayedDefenders.find((unit) => unit.id === member.selectionId)
                          const isMemberActionable = memberUnit?.actionableModes.includes(activeMode) === true
                          const isMemberDisabled = isSelectionLocked || (activeTurnActive && viewerRole === 'defender' && !isMemberActionable)
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
                                  member.selectionId,
                                  true,
                                )
                              }}
                            >
                              <div className="weapon-card-name">{member.label}</div>
                              <div className="weapon-card-stats">Toggle in attack group</div>
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })
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
            {displayedOnion ? (
              <button
                type="button"
                className={`onion-card-button ${activeSelectedUnitIds.includes(displayedOnion.id) ? 'is-selected' : ''}`}
                aria-pressed={activeSelectedUnitIds.includes(displayedOnion.id)}
                disabled={isSelectionLocked}
                data-selected={activeSelectedUnitIds.includes(displayedOnion.id)}
                data-testid={`combat-unit-${displayedOnion.id}`}
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
                    displayedOnion.id,
                    event.ctrlKey || event.metaKey,
                  )
                }}
              >
                <h3>{resolveBattlefieldUnitName(displayedOnion.type, displayedOnion.id, displayedOnion.friendlyName)}</h3>
                <div className="unit-summary">
                  <div className="summary-line">
                    <span>Treads <strong>{displayedOnion.treads}</strong></span>
                    <span>Moves <strong>{displayedOnion.movesRemaining}</strong></span>
                    <span>Rams remaining <strong>{displayedOnion.rams}</strong></span>
                  </div>
                  <div className="summary-line">
                    <span>Weapons <strong>{onionWeapons.operationalWeapons}</strong></span>
                    <span>Missiles <strong>{onionWeapons.operationalMissiles}</strong></span>
                  </div>
                </div>
              </button>
            ) : (
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
              <div className="defender-list">
                {defenderMoveGroups.map((group) => {
                  const isSelected = group.selectedCount > 0
                  const isMoveActionable = activeTurnActive && viewerRole === 'defender' && !group.isDestroyed
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
                      data-testid={`move-stack-group-${group.anchorUnit.id}`}
                    >
                      <button
                        type="button"
                        className={[
                          'defender-card-button',
                          'slim-weapon-card',
                          isSelected ? 'is-selected' : '',
                          isMoveActionable ? 'is-actionable' : '',
                          isSelectionLocked ? 'is-disabled' : '',
                          `tone-${statusTone(group.anchorUnit.status)}`,
                        ].join(' ')}
                        aria-pressed={isSelected}
                        disabled={isSelectionLocked}
                        data-selected={isSelected}
                        data-testid={`combat-unit-${group.anchorUnit.id}`}
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
                              subjectRelation: viewerRole === 'defender' ? 'self' : 'opponent',
                              subjectKind: 'stack',
                              subjectCapability: {
                                inspectable: true,
                                moveEligible: isMoveActionable,
                                attackerEligible: false,
                                targetEligible: false,
                              },
                            },
                            group.anchorUnit.id,
                            event.ctrlKey || event.metaKey,
                          )
                        }}
                      >
                        <div className="combat-stack-card-head">
                          <div className="weapon-card-name">{group.label}</div>
                          {group.members.length > 1 ? <span className="mini-tag">{group.attackReadyCount}/{group.members.length}</span> : null}
                        </div>
                        <div className="weapon-card-stats">Move: {group.moveAllowance} &nbsp;·&nbsp; Attack: {group.attackStrength}</div>
                      </button>
                      {isExpanded ? (
                        <div className="combat-stack-member-list">
                          {group.members.map((member) => {
                            const isMemberSelected = activeSelectedUnitIds.includes(member.selectionId)
                            return (
                              <button
                                key={member.selectionId}
                                type="button"
                                className={`attacker-card-button slim-weapon-card combat-stack-member-button${isMemberSelected ? ' is-selected' : ''}`}
                                aria-pressed={isMemberSelected}
                                data-selected={isMemberSelected}
                                data-testid={member.testId}
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
                                      gesture: 'primary-additive',
                                      subjectRelation: viewerRole === 'defender' ? 'self' : 'opponent',
                                      subjectKind: 'stack',
                                      subjectCapability: {
                                        inspectable: true,
                                        moveEligible: isMoveActionable,
                                        attackerEligible: false,
                                        targetEligible: false,
                                      },
                                    },
                                    member.selectionId,
                                    true,
                                  )
                                }}
                              >
                                <div className="weapon-card-name">{member.label}</div>
                                <div className="weapon-card-stats">Toggle in move group</div>
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
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
