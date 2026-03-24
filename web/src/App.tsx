import { useState } from 'react'
import { HexMapBoard } from './components/HexMapBoard'
import {
  battlefieldModes,
  defenders,
  onion,
  recentEvents,
  scenarioMap,
  statusTone,
  type Mode,
} from './mockBattlefield'
import './App.css'

function parseWeaponStats(weaponString: string) {
  const weapons = weaponString.split(',').map((w) => w.trim())
  let operationalWeapons = 0
  let operationalMissiles = 0

  for (const weapon of weapons) {
    if (weapon.includes('ready')) {
      if (weapon.toLowerCase().includes('missile')) {
        operationalMissiles++
      } else {
        operationalWeapons++
      }
    }
  }

  return { operationalWeapons, operationalMissiles }
}

function parseAttackStats(attackString: string) {
  const parts = attackString.split('/')
  const damage = parts[0].trim()
  const range = parts[1]?.includes('rng') ? parts[1].trim().replace('rng', '').trim() : '0'
  return { damage, range }
}

function App() {
  const [mode, setMode] = useState<Mode>('fire')
  const [selectedUnitId, setSelectedUnitId] = useState<string>('wolf-2')

  const yourTurn = true
  const availableUnits = defenders.filter((unit) => unit.actionableModes.includes(mode))
  const isOnionSelected = selectedUnitId === onion.id
  const selectedDefender = defenders.find((unit) => unit.id === selectedUnitId)
  const selectedUnit = selectedDefender ?? defenders[0]
  const targetLabel = mode === 'end-phase' ? 'No target required' : 'onion / treads'
  const selectedUnitIsActionable = selectedUnit.actionableModes.includes(mode)
  const onionWeapons = parseWeaponStats(onion.weapons)

  // Simulated last sync and event status for UI demo
  const [lastSync, setLastSync] = useState<Date>(new Date())
  const [eventStatus, setEventStatus] = useState<'ok' | 'fetching' | 'error'>('ok')

  function handleRefresh() {
    setEventStatus('fetching')
    setTimeout(() => {
      setLastSync(new Date())
      setEventStatus('ok')
    }, 800)
  }

  return (
    <div className="shell">
      <header className="topbar panel">
        <div className={`role-badge ${yourTurn ? 'role-badge-active' : 'role-badge-inactive'}`}>
          Defender
        </div>
        <div className="topbar-state">
          <div className="phase-chip">Turn 3</div>
          <div className="phase-chip">DEFENDER_COMBAT</div>
        </div>
        <div className="topbar-meta-small">
          <div>
            <span className="stat-label">Scenario</span>
            <strong>swamp-siege-01</strong>
          </div>
          <div>
            <span className="stat-label">Game ID</span>
            <strong>0aa2d94b</strong>
          </div>
        </div>
        <div className="header-utility-controls">
          <div className="utility-block">
            <span className="stat-label">Refresh</span>
            <button
              className="refresh-btn"
              title="Refresh game state"
              onClick={handleRefresh}
              aria-label="Refresh"
              disabled={eventStatus === 'fetching'}
            >
              &#x21bb;
            </button>
          </div>
          <div className="utility-block">
            <span className="stat-label">Last Sync</span>
            <span className="last-sync" title="Last sync time">
              {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <div className="utility-block">
            <span className="stat-label">Event Sync</span>
            <span className={`event-status event-status-${eventStatus}`}
              title={eventStatus === 'ok' ? 'Events up to date' : eventStatus === 'fetching' ? 'Fetching events...' : 'Event fetch error'}>
              {eventStatus === 'ok' && '●'}
              {eventStatus === 'fetching' && <span className="event-dot-spinner" />}
              {eventStatus === 'error' && '⚠'}
            </span>
          </div>
        </div>
      </header>

      <main className="battlefield-grid">
        <aside className="panel rail rail-left">
          <section className="section-block">
            <div className="card-head">
              <p className="eyebrow">Onion</p>
            </div>
            <button
              type="button"
              className={`onion-card-button ${selectedUnit.id === onion.id ? 'is-selected' : ''}`}
              onClick={() => setSelectedUnitId(onion.id)}
            >
              <h3>{onion.id}</h3>
              <div className="unit-summary">
                <div className="summary-line">
                  <span>Treads <strong>{onion.treads}</strong></span>
                  <span>Moves <strong>{onion.movesAllowed - onion.movesUsed}</strong></span>
                  <span>Rams <strong>{onion.rams}</strong></span>
                </div>
                <div className="summary-line">
                  <span>Weapons <strong>{onionWeapons.operationalWeapons}</strong></span>
                  <span>Missiles <strong>{onionWeapons.operationalMissiles}</strong></span>
                </div>
              </div>
            </button>
          </section>

          <section className="section-block">
            <div className="card-head">
              <p className="eyebrow">Defenders</p>
              <span className="mini-tag">{defenders.length} tracked</span>
            </div>
            <div className="defender-list">
              {defenders.map((unit) => {
                const isSelected = unit.id === selectedUnit.id
                const isActionable = unit.actionableModes.includes(mode)
                const attackStats = parseAttackStats(unit.attack)
                return (
                  <button
                    key={unit.id}
                    type="button"
                    className={[
                      'defender-card-button',
                      isSelected ? 'is-selected' : '',
                      isActionable ? 'is-actionable' : '',
                      `tone-${statusTone(unit.status)}`,
                    ].join(' ')}
                    onClick={() => setSelectedUnitId(unit.id)}
                  >
                    <p className="eyebrow">{unit.type}</p>
                    <h3>{unit.id}</h3>
                    <div className="unit-summary">
                      <div className="summary-line">
                        <span>Damage <strong>{attackStats.damage}</strong></span>
                        <span>Range <strong>{attackStats.range}</strong></span>
                        <span>Move <strong>{unit.move}</strong></span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        </aside>

        <section className="panel map-stage">
          <div className="map-frame">
            <HexMapBoard
              scenarioMap={scenarioMap}
              defenders={defenders}
              onion={onion}
              mode={mode}
              selectedUnitId={selectedUnit.id}
              onSelectUnit={setSelectedUnitId}
            />
          </div>
        </section>

        <aside className={`panel rail rail-right ${yourTurn ? 'controls-live' : 'controls-muted'}`}>
          {!isOnionSelected && (
            <section className="section-block">
              <div className="card-head">
                <div>
                  <p className="eyebrow">Action Composer</p>
                  <h2>Defender command stack</h2>
                </div>
                <span className="mini-tag mini-tag-live">controls active</span>
              </div>

              <div className="mode-row">
                {battlefieldModes.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`mode-button ${entry.id === mode ? 'mode-button-active' : ''}`}
                    onClick={() => setMode(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              <p className="helper-copy">{battlefieldModes.find((entry) => entry.id === mode)?.helper}</p>

              <div className="composer-grid">
                <div className="composer-field">
                  <span className="stat-label">Selected unit</span>
                  <strong>{mode === 'end-phase' ? 'Not required' : selectedUnit.id}</strong>
                </div>
                <div className="composer-field">
                  <span className="stat-label">Target</span>
                  <strong>{targetLabel}</strong>
                </div>
                <div className="composer-field">
                  <span className="stat-label">Weapon state</span>
                  <strong>{mode === 'end-phase' ? 'n/a' : selectedUnit.weapons}</strong>
                </div>
                <div className="composer-field">
                  <span className="stat-label">Validation</span>
                  <strong>
                    {mode === 'end-phase' || selectedUnitIsActionable
                      ? 'ready to submit'
                      : 'select an actionable unit'}
                  </strong>
                </div>
              </div>

              <button type="button" className="primary-action">
                {mode === 'end-phase' ? 'End Defender Combat' : 'Submit Action'}
              </button>
            </section>
          )}

          <section className="section-block panel-subtle">
            <div className="card-head">
              <div>
                <p className="eyebrow">
                  {isOnionSelected ? 'Onion Details' : 'Selected Unit'}
                </p>
                <h3>{isOnionSelected ? onion.id : selectedUnit.id}</h3>
              </div>
            </div>
            {isOnionSelected ? (
              <>
                <p className="summary-line">
                  {onion.type} · {onion.status} · ({onion.q},{onion.r})
                </p>
                <dl className="inspector-grid inspector-grid-right">
                  <div>
                    <dt>Treads</dt>
                    <dd>{onion.treads}</dd>
                  </div>
                  <div>
                    <dt>Move Available</dt>
                    <dd>{onion.movesAllowed - onion.movesUsed} / {onion.movesAllowed}</dd>
                  </div>
                  <div>
                    <dt>Rams</dt>
                    <dd>{onion.rams}</dd>
                  </div>
                  <div>
                    <dt>Weapons</dt>
                    <dd style={{ gridColumn: '1 / -1' }}>{onion.weapons}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <>
                <p className="summary-line">
                  {selectedUnit.type} · {selectedUnit.status} · ({selectedUnit.q},{selectedUnit.r})
                </p>
                <dl className="inspector-grid inspector-grid-right">
                  <div>
                    <dt>Weapons</dt>
                    <dd>{selectedUnit.weapons}</dd>
                  </div>
                  <div>
                    <dt>Attack</dt>
                    <dd>{selectedUnit.attack}</dd>
                  </div>
                  <div>
                    <dt>Move</dt>
                    <dd>{selectedUnit.move}</dd>
                  </div>
                  <div>
                    <dt>Mode Ready</dt>
                    <dd>{selectedUnitIsActionable ? 'yes' : 'no'}</dd>
                  </div>
                </dl>
              </>
            )}
          </section>

          <section className="section-block">
            <div className="card-head">
              <p className="eyebrow">Event Timeline</p>
              <span className="mini-tag">after seq 42</span>
            </div>
            <div className="event-list">
              {recentEvents.map((event) => (
                <article key={event.seq} className={`event-row ${event.tone === 'alert' ? 'event-row-alert' : ''}`}>
                  <div className="event-head">
                    <strong>#{event.seq}</strong>
                    <span>{event.type}</span>
                    <span>{event.timestamp}</span>
                  </div>
                  <p>{event.summary}</p>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  )
}

export default App
