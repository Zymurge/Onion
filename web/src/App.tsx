import { useState, useEffect } from 'react'
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

// Phase definitions
type Phase = 'onion' | 'defender'
const phases: Phase[] = ['onion', 'defender']
const phaseLabels: Record<Phase, string> = {
  onion: 'ONION MOVEMENT',
  defender: 'DEFENDER COMBAT',
}

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
    // Phase state
    const [phase, setPhase] = useState<Phase>('defender')
    
    // Debug diagnostics popup state
    const [debugOpen, setDebugOpen] = useState(false)
    const mockDebugLines = [
      '[12:00:01] [info] Game state loaded',
      '[12:00:02] [debug] Map rendered',
      '[12:00:03] [info] User selected unit wolf-2',
      '[12:00:04] [debug] Action composer ready',
      '[12:00:05] [info] Event timeline updated',
      '[12:00:06] [debug] Sync complete',
      '[12:00:07] [info] No errors detected',
      '[12:00:08] [debug] WebSocket connection initialized',
      '[12:00:09] [info] Game rules validation complete',
      '[12:00:10] [debug] Terrain generation started for scenario swamp-siege-01',
      '[12:00:11] [info] Generated 42 hexes with mixed terrain types',
      '[12:00:12] [debug] Unit positioning validated',
      '[12:00:13] [info] Onion unit placed at coordinates (5,3)',
      '[12:00:14] [debug] Defender units positioned: wolf-1, wolf-2, tiger-4, bear-1',
      '[12:00:15] [info] Action composer initialized with 4 legal move paths',
      '[12:00:16] [debug] UI rendering pipeline started',
      '[12:00:17] [info] Header components mounted successfully',
      '[12:00:18] [debug] MapBoard component initialized with 42 hexes',
      '[12:00:19] [info] Event timeline seeded with 6 mock events',
      '[12:00:20] [debug] Performance: Initial render completed in 142ms',
      '[12:00:21] [info] Listening for user input on map interactions',
      '[12:00:22] [debug] Drag handlers attached to debug popup window',
      '[12:00:23] [info] Refresh cycle: Last sync was 23 seconds ago',
      '[12:00:24] [debug] Event fetch status: OK (events up to date)',
      '[12:00:25] [info] Connection status: CONNECTED (polling mode)',
      '[12:00:26] [debug] Checking for stale game state...',
      '[12:00:27] [info] Game state fresh, no reconciliation needed',
      '[12:00:28] [debug] Memory usage: 18.4 MB (within acceptable range)',
      '[12:00:29] [info] All systems operational. Ready for player input.',
    ]
  const [mode, setMode] = useState<Mode>('fire')
  const [selectedUnitId, setSelectedUnitId] = useState<string>('wolf-2')
  const gameId = 42

  const yourTurn = true
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

  // Floating, draggable, resizable debug popup component
  function DraggableDebugPopup({ onClose, lines, phase, setPhase }: { onClose: () => void; lines: string[]; phase: Phase; setPhase: (phase: Phase) => void }) {
    const [pos, setPos] = useState({ x: window.innerWidth - 380, y: 90 })
    const [size, setSize] = useState({ width: 340, height: 400 })
    const [dragging, setDragging] = useState(false)
    const [resizing, setResizing] = useState(false)
    const [offset, setOffset] = useState({ x: 0, y: 0 })
    const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })

    function onMouseDown(e: React.MouseEvent) {
      setDragging(true)
      setOffset({ x: e.clientX - pos.x, y: e.clientY - pos.y })
      document.body.style.userSelect = 'none'
    }
    
    function onResizeMouseDown(e: React.MouseEvent) {
      e.preventDefault()
      setResizing(true)
      setResizeStart({ x: e.clientX, y: e.clientY, width: size.width, height: size.height })
      document.body.style.userSelect = 'none'
    }
    
    function onMouseMove(e: MouseEvent) {
      if (dragging) {
        setPos({ x: e.clientX - offset.x, y: e.clientY - offset.y })
      }
      if (resizing) {
        const deltaX = e.clientX - resizeStart.x
        const deltaY = e.clientY - resizeStart.y
        const newWidth = Math.max(250, resizeStart.width + deltaX)
        const newHeight = Math.max(200, resizeStart.height + deltaY)
        setSize({ width: newWidth, height: newHeight })
      }
    }
    
    function onMouseUp() {
      setDragging(false)
      setResizing(false)
      document.body.style.userSelect = ''
    }
    
    useEffect(() => {
      if (dragging || resizing) {
        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
        return () => {
          window.removeEventListener('mousemove', onMouseMove)
          window.removeEventListener('mouseup', onMouseUp)
        }
      }
    })
    return (
      <div
        className="debug-popup"
        style={{ left: pos.x, top: pos.y, width: size.width, height: size.height }}
      >
        <div className="debug-popup-header" onMouseDown={onMouseDown} style={{ cursor: 'move' }}>
          <span>Debug Diagnostics</span>
          <button className="debug-popup-close" onClick={onClose} title="Close debug window">×</button>
        </div>
        <div className="debug-popup-body">
          {lines.map((line: string, i: number) => (
            <div key={i} className="debug-line">{line}</div>
          ))}
        </div>
        <div className="debug-popup-footer">
          <button
            className="debug-cycle-phase-btn"
            onClick={() => {
              const currentIndex = phases.indexOf(phase)
              const nextIndex = (currentIndex + 1) % phases.length
              setPhase(phases[nextIndex])
            }}
            title="Cycle to next phase (for testing)"
          >
            Cycle Phase → {phaseLabels[phase]}
          </button>
        </div>
        <div className="debug-popup-resize" onMouseDown={onResizeMouseDown} title="Drag to resize">⤡</div>
      </div>
    )
  }

  return (
    <div className="shell" data-phase={phase}>
      <header className="topbar panel">
        <div className={`role-badge ${phase === 'defender' ? 'role-badge-active' : 'role-badge-inactive'}`}>
          Defender
        </div>
        <div className="topbar-state">
          <div className="phase-chip phase-chip-turn">
            <span>Turn 3</span>
          </div>
          <div className="phase-chip phase-chip-state">
            <span>{phaseLabels[phase]}</span>
          </div>
        </div>
        <div className="header-utility-controls">
          <div className="utility-group-vert">
            <div>
              <span className="stat-label-small">Scenario</span>
              <strong>The Siege of Shrek's Swamp</strong>
            </div>
            <div>
              <span className="stat-label-small">Game ID</span>
              <strong>{gameId}</strong>
            </div>
          </div>
          <div className="utility-group-vert">
            <button
              className="refresh-btn"
              title="Refresh game state"
              onClick={handleRefresh}
              aria-label="Refresh"
              disabled={eventStatus === 'fetching'}
            >
              Refresh
            </button>
            <button
              className={`debug-toggle-btn${debugOpen ? ' active' : ''}`}
              title="Toggle debug diagnostics"
              aria-label="Toggle debug diagnostics"
              onClick={() => setDebugOpen((v) => !v)}
            >
              Debug
            </button>
          </div>
          <div className="utility-group-vert">
            <div className="sync-status-block" title={eventStatus === 'ok' ? 'Events up to date' : eventStatus === 'fetching' ? 'Fetching events...' : 'Event fetch error'}>
              <span className="stat-label-small">Sync</span>
              <span className={`event-status event-status-${eventStatus}`}>
                {eventStatus === 'ok' && '●'}
                {eventStatus === 'fetching' && <span className="event-dot-spinner" />}
                {eventStatus === 'error' && '⚠'}
              </span>
            </div>
            <div className="last-sync-block" title="Last sync time">
              <span className="stat-label-small">Last</span>
              <span className="last-sync">
                {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </header>

      {debugOpen && (
        <DraggableDebugPopup onClose={() => setDebugOpen(false)} lines={mockDebugLines} phase={phase} setPhase={setPhase} />
      )}

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
                {mode === 'end-phase' ? `End ${phaseLabels[phase].split('_')[0]}` : 'Submit Action'}
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
