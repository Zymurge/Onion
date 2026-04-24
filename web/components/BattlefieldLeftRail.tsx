import { statusTone, type BattlefieldOnionView, type BattlefieldUnit, type Mode } from '../lib/battlefieldView'
import {
  buildStackMemberSelectionId,
  buildWeaponSelectionId,
  countSelectedBattlefieldStackMembers,
  getBattlefieldStackSize,
  parseAttackStats,
  resolveBattlefieldStackLabel,
  resolveBattlefieldUnitName,
  resolveBattlefieldWeaponName,
  resolveSelectionOwnerUnitId,
} from '../lib/appViewHelpers'
import type { StackNamingSnapshot } from '../../shared/stackNaming'
import { buildStackRosterIndex, type StackRosterState } from '../../shared/stackRoster'
import type { Weapon } from '../../shared/types/index'

type BattlefieldLeftRailProps = {
  activeCombatRole: 'onion' | 'defender' | null
  activeMode: Mode
  activeSelectedUnitIds: string[]
  displayedDefenders: ReadonlyArray<BattlefieldUnit>
  displayedOnion: BattlefieldOnionView | null
  isCombatPhase: boolean
  isMovementPhase: boolean
  isSelectionLocked: boolean
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
  isActionable: boolean
  isDestroyed: boolean
  label: string
  members: DefenderCombatGroupMember[]
  range: number
  selectedCount: number
}

function findRosterGroupForCombatUnits(
  rosterIndex: ReturnType<typeof buildStackRosterIndex> | null,
  units: ReadonlyArray<BattlefieldUnit>,
): ReturnType<typeof buildStackRosterIndex>['groupsById'][string] | null {
  if (rosterIndex === null) {
    return null
  }

  const unitIds = new Set(units.map((unit) => unit.id))
  for (const group of Object.values(rosterIndex.groupsById)) {
    if (group.unitIds.every((unitId) => unitIds.has(unitId))) {
      return group
    }
  }

  return null
}

function buildDefenderCombatGroups(
  displayedDefenders: ReadonlyArray<BattlefieldUnit>,
  activeMode: Mode,
  activeSelectedUnitIds: string[],
  stackNaming: StackNamingSnapshot | undefined,
  stackRoster: StackRosterState | undefined,
): DefenderCombatGroup[] {
  const rosterIndex = stackRoster !== undefined ? buildStackRosterIndex(stackRoster) : null
  const groupedUnits = new Map<string, BattlefieldUnit[]>()

  for (const unit of displayedDefenders) {
    const groupKey = `${unit.type}:${unit.q}:${unit.r}`
    const existingGroup = groupedUnits.get(groupKey) ?? []
    existingGroup.push(unit)
    groupedUnits.set(groupKey, existingGroup)
  }

  return [...groupedUnits.entries()].map(([groupKey, units]) => {
    const rosterGroup = findRosterGroupForCombatUnits(rosterIndex, units)
    const anchorUnit = rosterGroup !== null
      ? units.find((unit) => rosterGroup.unitIds.includes(unit.id)) ?? units[0]
      : units[0]
    const isActionable = anchorUnit.actionableModes.includes(activeMode)
    const isDestroyed = anchorUnit.status === 'destroyed'
    const baseAttackStats = parseAttackStats(anchorUnit.attack)
    const stackSize = rosterGroup !== null ? rosterGroup.units.length : units.length > 1 ? units.length : getBattlefieldStackSize(anchorUnit)
    const label = resolveBattlefieldStackLabel(
      anchorUnit.type,
      anchorUnit.id,
      anchorUnit.friendlyName,
      stackSize,
      rosterGroup?.groupKey ?? `${anchorUnit.type}:${anchorUnit.q},${anchorUnit.r}`,
      stackNaming,
    )
    const rosterMembers = rosterGroup?.units ?? null
    const members = rosterMembers !== null && rosterMembers.length > 1
      ? rosterMembers.map((unit) => ({
        selectionId: unit.id,
        testId: `combat-stack-member-${unit.id}`,
        label: unit.friendlyName,
      }))
      : units.length > 1
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
    const selectedCount = countSelectedBattlefieldStackMembers(
      {
        defenders: {
          [anchorUnit.id]: {
            id: anchorUnit.id,
            type: anchorUnit.type,
            position: { q: anchorUnit.q, r: anchorUnit.r },
            status: anchorUnit.status,
            squads: anchorUnit.squads,
          },
          ...Object.fromEntries(
            units.slice(1).map((unit) => [
              unit.id,
              {
                id: unit.id,
                type: unit.type,
                position: { q: unit.q, r: unit.r },
                status: unit.status,
                squads: unit.squads,
              },
            ]),
          ),
        },
      },
      anchorUnit.id,
      activeSelectedUnitIds,
    )

    return {
      anchorUnit,
      attackStrength: units.length > 1
        ? units.reduce((total, unit) => total + parseAttackStats(unit.attack).damage, 0)
        : baseAttackStats.damage * stackSize,
      isActionable,
      isDestroyed,
      label,
      members,
      range: baseAttackStats.range,
      selectedCount,
    }
  })
}

export function BattlefieldLeftRail({
  activeCombatRole,
  activeMode,
  activeSelectedUnitIds,
  displayedDefenders,
  displayedOnion,
  isCombatPhase,
  isMovementPhase,
  isSelectionLocked,
  onionWeapons,
  readyWeaponDetails,
  selectedCombatAttackLabel,
  stackNaming,
  stackRoster,
  onSelectUnit,
}: BattlefieldLeftRailProps) {
  const defenderCombatGroups = activeCombatRole === 'defender' && isCombatPhase
    ? buildDefenderCombatGroups(displayedDefenders, activeMode, activeSelectedUnitIds, stackNaming, stackRoster)
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
            <span className="mini-tag mini-tag-live" data-testid="combat-attack-total">{selectedCombatAttackLabel}</span>
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
                        onSelectUnit(selectionId, event.ctrlKey || event.metaKey)
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
                const isDisabled = group.isDestroyed || !group.isActionable
                const isExpanded = group.members.length > 1 && group.selectedCount > 0
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
                        group.isActionable ? 'is-actionable' : '',
                        isDisabled ? 'is-disabled' : '',
                        `tone-${statusTone(group.anchorUnit.status)}`,
                      ].join(' ')}
                      aria-pressed={isSelected}
                      disabled={isSelectionLocked}
                      data-selected={isSelected}
                      data-testid={`combat-unit-${group.anchorUnit.id}`}
                      title={group.isDestroyed ? 'Destroyed units cannot attack.' : !group.isActionable ? 'This unit is not eligible to attack.' : undefined}
                      onClick={(event) => {
                        if (isSelectionLocked) {
                          event.preventDefault()
                          event.stopPropagation()
                          return
                        }

                        event.stopPropagation()
                        onSelectUnit(group.anchorUnit.id, event.ctrlKey || event.metaKey)
                      }}
                    >
                      <div className="combat-stack-card-head">
                        <div className="weapon-card-name">{group.label}</div>
                        {group.members.length > 1 ? <span className="mini-tag">{group.selectedCount}/{group.members.length}</span> : null}
                      </div>
                      <div className="weapon-card-stats">Attack: {group.attackStrength} &nbsp;·&nbsp; Range: {group.range}</div>
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
                              disabled={isSelectionLocked}
                              data-selected={isMemberSelected}
                              data-testid={member.testId}
                              onClick={(event) => {
                                if (isSelectionLocked) {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  return
                                }

                                event.stopPropagation()
                                onSelectUnit(member.selectionId, true)
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
              <p className="eyebrow">Onion</p>
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
                  onSelectUnit(displayedOnion.id, event.ctrlKey || event.metaKey)
                }}
              >
                <h3>{displayedOnion.friendlyName ?? displayedOnion.id}</h3>
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
            {displayedDefenders.length > 0 ? (
              <div className="defender-list">
                {displayedDefenders.map((unit) => {
                  const isSelected = activeSelectedUnitIds.includes(unit.id)
                  const isActionable = unit.actionableModes.includes(activeMode)
                  const attackStats = parseAttackStats(unit.attack)
                  const isDestroyed = unit.status === 'destroyed'
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      className={[
                        'defender-card-button',
                        'slim-weapon-card',
                        isSelected ? 'is-selected' : '',
                        isActionable ? 'is-actionable' : '',
                        `tone-${statusTone(unit.status)}`,
                      ].join(' ')}
                      aria-pressed={isSelected}
                      disabled={isSelectionLocked || isDestroyed}
                      data-selected={isSelected}
                      data-testid={`combat-unit-${unit.id}`}
                      onClick={(event) => {
                        if (isSelectionLocked) {
                          event.preventDefault()
                          event.stopPropagation()
                          return
                        }

                        if (isDestroyed) {
                          event.stopPropagation()
                          return
                        }
                        event.stopPropagation()
                        onSelectUnit(unit.id, event.ctrlKey || event.metaKey)
                      }}
                    >
                      <div className="weapon-card-name">{unit.friendlyName ?? unit.type}</div>
                      <div className="weapon-card-stats">Damage: {attackStats.damage} &nbsp;·&nbsp; Range: {attackStats.range} &nbsp;·&nbsp; Move: {unit.move}</div>
                    </button>
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
