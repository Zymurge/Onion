import { statusTone, type BattlefieldOnionView, type BattlefieldUnit, type Mode } from '../lib/battlefieldView'
import { buildWeaponSelectionId, parseAttackStats } from '../lib/appViewHelpers'
import type { Weapon } from '../../shared/types/index'

type BattlefieldLeftRailProps = {
  activeCombatRole: 'onion' | 'defender' | null
  activeMode: Mode
  activeSelectedUnitIds: string[]
  displayedDefenders: ReadonlyArray<BattlefieldUnit>
  displayedOnion: BattlefieldOnionView | null
  isCombatPhase: boolean
  isMovementPhase: boolean
  onionWeapons: {
    operationalWeapons: number
    operationalMissiles: number
  }
  readyWeaponDetails: ReadonlyArray<Weapon>
  selectedCombatAttackLabel: string
  onSelectDefenderCombatTarget: () => void
  onSelectUnit: (unitId: string, additive?: boolean) => void
}

export function BattlefieldLeftRail({
  activeCombatRole,
  activeMode,
  activeSelectedUnitIds,
  displayedDefenders,
  displayedOnion,
  isCombatPhase,
  isMovementPhase,
  onionWeapons,
  readyWeaponDetails,
  selectedCombatAttackLabel,
  onSelectDefenderCombatTarget,
  onSelectUnit,
}: BattlefieldLeftRailProps) {
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
                      data-selected={isSelected}
                      data-testid={`combat-weapon-${weapon.id}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectUnit(selectionId, event.ctrlKey || event.metaKey)
                      }}
                    >
                      <div className="weapon-card-name">{weapon.name}</div>
                      <div className="weapon-card-stats">Attack: {weapon.attack} &nbsp;·&nbsp; Range: {weapon.range}</div>
                    </button>
                  )
                })
              ) : (
                <p className="summary-line">No ready weapons available.</p>
              )
            ) : displayedDefenders.length > 0 ? (
              displayedDefenders.map((unit) => {
                const isSelected = activeSelectedUnitIds.includes(unit.id)
                const isActionable = unit.actionableModes.includes(activeMode)
                const attackStats = parseAttackStats(unit.attack)
                const isDestroyed = unit.status === 'destroyed'
                const isDisabled = isDestroyed || !isActionable
                return (
                  <button
                    key={unit.id}
                    type="button"
                    className={[
                      'attacker-card-button',
                      isSelected ? 'is-selected' : '',
                      isActionable ? 'is-actionable' : '',
                      isDisabled ? 'is-disabled' : '',
                      `tone-${statusTone(unit.status)}`,
                    ].join(' ')}
                    aria-pressed={isSelected}
                    data-selected={isSelected}
                    data-testid={`combat-unit-${unit.id}`}
                    disabled={false}
                    title={isDestroyed ? 'Destroyed units cannot attack.' : !isActionable ? 'This unit is not eligible to attack.' : undefined}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelectUnit(unit.id, event.ctrlKey || event.metaKey)
                    }}
                  >
                    <div className="weapon-card-name">{unit.type}</div>
                    <div className="weapon-card-stats">Attack: {attackStats.damage} &nbsp;·&nbsp; Range: {attackStats.range}</div>
                  </button>
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
                data-selected={activeSelectedUnitIds.includes(displayedOnion.id)}
                data-testid={`combat-unit-${displayedOnion.id}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelectUnit(displayedOnion.id, event.ctrlKey || event.metaKey)
                }}
              >
                <h3>{displayedOnion.id}</h3>
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
                      data-selected={isSelected}
                      data-testid={`combat-unit-${unit.id}`}
                      disabled={isDestroyed}
                      onClick={(event) => {
                        if (isDestroyed) {
                          event.stopPropagation()
                          return
                        }
                        event.stopPropagation()
                        onSelectDefenderCombatTarget()
                      }}
                    >
                      <div className="weapon-card-name">{unit.type}</div>
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
