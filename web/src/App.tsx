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

function App() {
  const [mode, setMode] = useState<Mode>('fire')
  const [selectedUnitId, setSelectedUnitId] = useState<string>('wolf-2')

  const yourTurn = true
  const availableUnits = defenders.filter((unit) => unit.actionableModes.includes(mode))
  const selectedUnit = defenders.find((unit) => unit.id === selectedUnitId) ?? defenders[0]
  const targetLabel = mode === 'end-phase' ? 'No target required' : 'onion / treads'
  const selectedUnitIsActionable = selectedUnit.actionableModes.includes(mode)

  return (
    <div className="shell">
      <header className="topbar panel">
        <div>
          <p className="eyebrow">Onion Web Command</p>
          <h1>Swamp Siege Command Table</h1>
        </div>
        <div className="topbar-meta">
          <div className="phase-chip">Turn 3 · DEFENDER_COMBAT</div>
          <div className={`turn-chip ${yourTurn ? 'turn-chip-live' : 'turn-chip-waiting'}`}>
            {yourTurn ? 'Your turn: controls armed' : 'Opponent turn: controls locked'}
          </div>
        </div>
      </header>

      <main className="battlefield-grid">
        <aside className="panel rail rail-left">
          <section className="section-block">
            <p className="eyebrow">Game Context</p>
            <div className="stat-grid">
              <div>
                <span className="stat-label">Scenario</span>
                <strong>swamp-siege-01</strong>
              </div>
              <div>
                <span className="stat-label">Game ID</span>
                <strong>0aa2d94b</strong>
              </div>
              <div>
                <span className="stat-label">Role</span>
                <strong>Defender</strong>
              </div>
              <div>
                <span className="stat-label">Event Seq</span>
                <strong>47</strong>
              </div>
            </div>
          </section>

          <section className="section-block panel-subtle onion-card">
            <div className="card-head">
              <p className="eyebrow">Onion</p>
              <span className="status-pill status-pill-ready">{onion.status}</span>
            </div>
            <h2>{onion.id}</h2>
            <p className="summary-line">
              {onion.type} at ({onion.q},{onion.r}) · treads {onion.treads}
            </p>
            <p className="detail-copy">{onion.weapons}</p>
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
                return (
                  <button
                    key={unit.id}
                    type="button"
                    className={[
                      'defender-row',
                      isSelected ? 'is-selected' : '',
                      isActionable ? 'is-actionable' : '',
                      `tone-${statusTone(unit.status)}`,
                    ].join(' ')}
                    onClick={() => setSelectedUnitId(unit.id)}
                  >
                    <div>
                      <strong>{unit.id}</strong>
                      <span>{unit.type}</span>
                    </div>
                    <div>
                      <span>{unit.weapons}</span>
                      <span>mv {unit.move}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        </aside>

        <section className="panel map-stage">
          <div className="card-head">
            <div>
              <p className="eyebrow">Map Board</p>
              <h2>Axial coordinates rendered as a real hex field</h2>
            </div>
            <div className="selection-pill">Selected: {selectedUnit.id}</div>
          </div>

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

          <aside className="selection-panel selection-panel-footer panel-subtle">
            <div className="selection-panel-header">
              <div>
                <p className="eyebrow">Selection Inspector</p>
                <h3>{selectedUnit.id}</h3>
              </div>
              <p className="summary-line">
                {selectedUnit.type} · {selectedUnit.status} · ({selectedUnit.q},{selectedUnit.r})
              </p>
            </div>
            <dl className="inspector-grid inspector-grid-footer">
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
          </aside>
        </section>

        <aside className={`panel rail rail-right ${yourTurn ? 'controls-live' : 'controls-muted'}`}>
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

          <section className="section-block panel-subtle">
            <div className="card-head">
              <p className="eyebrow">Available Units</p>
              <span className="mini-tag">{availableUnits.length} actionable</span>
            </div>
            <div className="availability-list">
              {availableUnits.length === 0 ? (
                <div className="empty-state">No unit selection required in this mode.</div>
              ) : (
                availableUnits.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    className={`availability-row ${unit.id === selectedUnit.id ? 'availability-row-selected' : ''}`}
                    onClick={() => setSelectedUnitId(unit.id)}
                  >
                    <div>
                      <strong>{unit.id}</strong>
                      <span>{unit.type}</span>
                    </div>
                    <div>
                      <span>{unit.attack}</span>
                      <span>{unit.weapons}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
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
