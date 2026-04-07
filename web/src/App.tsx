import { createPortal } from 'react-dom'
import { useState, useEffect, useMemo, useRef, useSyncExternalStore, type FormEvent } from 'react'
import ReactJsonPrintImport from 'react-json-print'
import { HexMapBoard } from './components/HexMapBoard'
import { CombatConfirmationView } from './components/CombatConfirmationView'
import { CombatResolutionToast } from './components/CombatResolutionToast'
import {
  GameClientSeamError,
  type GameAction,
  type GameClient,
  type GameSnapshot,
} from './lib/gameClient'
import {
  statusTone,
  type BattlefieldOnionView,
  type BattlefieldUnit,
  type Mode,
  type TerrainHex,
} from './lib/battlefieldView'
import { createGameSessionController } from './lib/gameSessionController'
import { buildCombatRangeHexKeys } from './lib/combatRange'
import { buildCombatTargetOptions } from './lib/combatPreview'
import type { WebRuntimeConfig } from './lib/appBootstrap'
import { createHttpGameRequestTransport } from './lib/httpGameClient'
import { createLiveEventSource } from './lib/liveEventSource'
import { useGameSession } from './lib/useGameSession'
import {
  getApiProtocolTrafficSnapshot,
  getApiProtocolTrafficVersion,
  type ApiProtocolTrafficEntry,
  requestJson,
  sanitizeApiProtocolTrafficEntry,
  subscribeApiProtocolTraffic,
} from '../../src/shared/apiProtocol'
import { getUnitMovementAllowance } from '../../src/shared/unitMovement'
import type { TurnPhase, UnitStatus, Weapon } from '../../src/types/index'
import type {
  GameRequestTransport,
  GameSessionController,
  GameSessionViewState,
  LiveConnectionStatus,
  LiveEventSource,
} from './lib/gameSessionTypes'
import './App.css'

const ReactJsonPrint =
  typeof ReactJsonPrintImport === 'function'
    ? ReactJsonPrintImport
    : (ReactJsonPrintImport as { default?: typeof ReactJsonPrintImport }).default ?? ReactJsonPrintImport

const turnPhaseLabels: Record<TurnPhase, string> = {
  ONION_MOVE: 'Onion Movement',
  ONION_COMBAT: 'Onion Combat',
  DEFENDER_RECOVERY: 'Defender Recovery',
  DEFENDER_MOVE: 'Defender Movement',
  DEFENDER_COMBAT: 'Defender Combat',
  GEV_SECOND_MOVE: 'GEV Second Move',
}

function getPhaseOwner(phase: TurnPhase | null): 'onion' | 'defender' | null {
  if (phase === null) {
    return null
  }

  if (phase.startsWith('ONION_')) {
    return 'onion'
  }

  if (phase.startsWith('DEFENDER_') || phase === 'GEV_SECOND_MOVE') {
    return 'defender'
  }

  return null
}

function getPhaseAdvanceLabel(phase: TurnPhase | null, role: 'onion' | 'defender' | null): string | null {
  if (phase === null || role === null) {
    return null
  }

  switch (phase) {
    case 'ONION_MOVE':
      return role === 'onion' ? 'Start Combat' : null
    case 'ONION_COMBAT':
      return role === 'onion' ? 'End Turn' : null
    case 'DEFENDER_MOVE':
      return role === 'defender' ? 'Start Combat' : null
    case 'DEFENDER_COMBAT':
      return role === 'defender' ? 'Begin Secondary Move' : null
    case 'GEV_SECOND_MOVE':
      return role === 'defender' ? 'End Turn' : null
    case 'DEFENDER_RECOVERY':
      return null
  }
}

function formatLiveConnectionStatus(connectionStatus: LiveConnectionStatus) {
  switch (connectionStatus) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting'
    case 'reconnecting':
      return 'Reconnecting'
    case 'disconnected':
      return 'Disconnected'
    case 'idle':
      return 'Idle'
  }
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

function formatWeaponSummary(weapons: ReadonlyArray<Weapon> | undefined) {
  if (weapons === undefined || weapons.length === 0) {
    return 'n/a'
  }

  return weapons.map((weapon) => `${weapon.id}: ${weapon.status}`).join(', ')
}

function formatAttackSummary(weapons: ReadonlyArray<Weapon> | undefined) {
  if (weapons === undefined || weapons.length === 0) {
    return '0 / rng 0'
  }

  const primaryWeapon = weapons.reduce((strongest, weapon) => {
    if (weapon.attack > strongest.attack) {
      return weapon
    }

    if (weapon.attack === strongest.attack && weapon.range > strongest.range) {
      return weapon
    }

    return strongest
  })

  return `${primaryWeapon.attack} / rng ${primaryWeapon.range}`
}

function formatDebugEntrySummary(entry: ApiProtocolTrafficEntry) {
  const time = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const arrow = entry.direction === 'request' ? '→' : entry.direction === 'response' ? '←' : '!'
  const parts = [`[${time}]`, `${arrow} ${entry.method} ${entry.path}`]

  if (entry.status !== undefined) {
    parts.push(`status ${entry.status}`)
  }

  if (entry.message !== undefined) {
    parts.push(entry.message)
  }

  return parts.join(' ')
}

function getReadyWeaponRange(weapons: ReadonlyArray<Weapon> | undefined): number {
  if (weapons === undefined || weapons.length === 0) {
    return 0
  }

  return weapons
    .filter((weapon) => weapon.status === 'ready')
    .reduce((maxRange, weapon) => Math.max(maxRange, weapon.range), 0)
}

function parseRangeValue(rangeText: string): number {
  const parsedRange = Number.parseInt(rangeText, 10)
  return Number.isNaN(parsedRange) ? 0 : parsedRange
}

function getTerrainTypeAt(scenarioMap: { width: number; height: number; hexes: TerrainHex[] } | null | undefined, q: number, r: number): number | undefined {
  return scenarioMap?.hexes.find((hex) => hex.q === q && hex.r === r)?.t
}

function getDisplayDefense(type: string, squads: number | undefined, terrainType: number | undefined): number {
  if (type === 'LittlePigs') {
    const stackSize = squads ?? 1
    return stackSize + (terrainType === 1 ? 1 : 0)
  }

  switch (type) {
    case 'BigBadWolf':
      return 4
    case 'Puss':
      return 3
    case 'Witch':
      return 2
    case 'LordFarquaad':
      return 0
    case 'Pinocchio':
      return 3
    case 'Dragon':
      return 3
    case 'Castle':
      return 0
    default:
      return 0
  }
}

function isWeaponSelectionId(selectionId: string) {
  return selectionId.startsWith('weapon:')
}

function stripWeaponSelectionId(selectionId: string) {
  return selectionId.replace(/^weapon:/, '')
}

function buildWeaponSelectionId(weaponId: string) {
  return `weapon:${weaponId}`
}

function buildCombatTargetActionId(targetId: string, onionId: string | undefined): string {
  if (targetId.startsWith('weapon:')) {
    return stripWeaponSelectionId(targetId)
  }

  if (targetId.endsWith(':treads')) {
    return onionId ?? targetId
  }

  return targetId
}

function getActionableModes(status: UnitStatus | undefined, weapons: ReadonlyArray<Weapon> | undefined, activeTurnActive: boolean): Mode[] {
  if (!activeTurnActive || status === 'destroyed' || status === 'disabled') {
    return []
  }

  const hasReadyWeapon = (weapons ?? []).some((weapon) => weapon.status === 'ready')
  return hasReadyWeapon ? ['fire', 'combined'] : []
}

function buildLiveDefenders(snapshot: GameSnapshot, activePhase: TurnPhase | null, activeTurnActive: boolean): BattlefieldUnit[] {
  const authoritativeState = snapshot.authoritativeState

  if (authoritativeState === undefined) {
    return []
  }

  const movementRemainingByUnit = snapshot.movementRemainingByUnit ?? {}

  return Object.entries(authoritativeState.defenders)
    .map(([defenderId, defender], index) => {
      const resolvedDefenderId = defender.id ?? defenderId
      const snapshotMovementRemaining = movementRemainingByUnit[resolvedDefenderId]

      return {
        id: resolvedDefenderId,
        type: defender.type,
        status: defender.status,
        q: defender.position.q,
        r: defender.position.r,
        move: activePhase === null ? 0 : snapshotMovementRemaining ?? 0,
        weapons: formatWeaponSummary(defender.weapons),
        attack: formatAttackSummary(defender.weapons),
        weaponDetails: defender.weapons ?? [],
        targetRules: defender.targetRules,
        defense: getDisplayDefense(defender.type, defender.squads, getTerrainTypeAt(snapshot.scenarioMap, defender.position.q, defender.position.r)),
        squads: defender.squads,
        actionableModes: getActionableModes(defender.status, defender.weapons, activeTurnActive),
        rosterOrder: index,
      }
    })
    .sort((left, right) => {
      const destroyedDelta = Number(left.status === 'destroyed') - Number(right.status === 'destroyed')

      if (destroyedDelta !== 0) {
        return destroyedDelta
      }

      return left.rosterOrder - right.rosterOrder
    })
    .map(({ rosterOrder, ...unit }) => {
      void rosterOrder

      return unit
    })
}

function buildLiveOnion(snapshot: GameSnapshot, activePhase: TurnPhase | null): BattlefieldOnionView {
  const authoritativeState = snapshot.authoritativeState

  if (authoritativeState === undefined) {
    throw new Error('Missing authoritative state')
  }

  const onion = authoritativeState.onion
  const movementRemainingByUnit = snapshot.movementRemainingByUnit ?? {}
  const movesAllowed = activePhase === null ? 0 : getUnitMovementAllowance('TheOnion', activePhase, onion.treads)
  const movesRemaining = activePhase === null ? 0 : movementRemainingByUnit[onion.id ?? 'onion-1'] ?? 0

  return {
    id: onion.id ?? 'onion-1',
    type: onion.type ?? 'TheOnion',
    q: onion.position.q,
    r: onion.position.r,
    status: onion.status ?? 'operational',
    treads: onion.treads,
    movesAllowed,
    movesRemaining,
    rams: authoritativeState.ramsThisTurn ?? 0,
    weapons: formatWeaponSummary(onion.weapons),
    weaponDetails: onion.weapons ?? [],
    targetRules: onion.targetRules,
  }
}

function buildScenarioMap(snapshot: GameSnapshot | null): { width: number; height: number; hexes: TerrainHex[] } | null {
  const scenarioMap = snapshot?.scenarioMap

  if (scenarioMap === undefined) {
    return null
  }

  return {
    width: scenarioMap.width,
    height: scenarioMap.height,
    hexes: scenarioMap.hexes,
  }
}

function buildCombatRangeSources(
  phase: TurnPhase | null,
  activeCombatRole: 'onion' | 'defender' | null,
  activeSelectedUnitIds: ReadonlyArray<string>,
  displayedDefenders: ReadonlyArray<BattlefieldUnit>,
  displayedOnion: BattlefieldOnionView | null,
) {
  if (phase === null || activeCombatRole === null) {
    return []
  }

  if (activeCombatRole === 'onion') {
    if (displayedOnion === null) {
      return []
    }

    const selectedWeaponIds = new Set(activeSelectedUnitIds.filter(isWeaponSelectionId).map(stripWeaponSelectionId))

    return (displayedOnion.weaponDetails ?? [])
      .filter((weapon) => weapon.status === 'ready' && selectedWeaponIds.has(weapon.id))
      .map((weapon) => ({
        q: displayedOnion.q,
        r: displayedOnion.r,
        range: weapon.range,
      }))
  }

  return displayedDefenders
    .filter((unit) => unit.status !== 'destroyed')
    .filter((unit) => activeSelectedUnitIds.includes(unit.id))
    .map((unit) => ({
      q: unit.q,
      r: unit.r,
      range: getReadyWeaponRange(unit.weaponDetails),
    }))
}

type AppProps = {
  gameClient?: GameClient
  gameId?: number
  liveEventSource?: LiveEventSource
  runtimeConfig?: WebRuntimeConfig
  showConnectionGate?: boolean
}

type AuthResponse = {
  userId: string
  token: string
}

type DebugPopupLayout = {
  position: { x: number; y: number }
  size: { width: number; height: number }
}

type SessionBinding = {
  gameId: number
  requestTransport: GameRequestTransport
  liveEventSource: LiveEventSource
}

const idleSessionState: GameSessionViewState = {
  status: 'idle',
  snapshot: null,
  session: null,
  liveConnection: 'idle',
  lastAppliedEventSeq: null,
  lastAppliedEventType: null,
  lastUpdatedAt: null,
  error: null,
}

const idleLiveEventSource: LiveEventSource = {
  subscribe() {
    return () => {}
  },
  connect() {},
  disconnect() {},
  getConnectionState() {
    return 'idle'
  },
}

const idleSessionController: GameSessionController = {
  subscribe() {
    return () => {}
  },
  getSnapshot() {
    return idleSessionState
  },
  async load() {
    return
  },
  async refresh() {
    return
  },
  async submitAction() {
    return null
  },
  dispose() {},
}

function createRequestTransportFromGameClient(gameClient: GameClient): GameRequestTransport {
  return {
    getState(gameId) {
      return gameClient.getState(gameId)
    },
    submitAction(gameId, action) {
      return gameClient.submitAction(gameId, action)
    },
  }
}

function DraggableDebugPopup({
  layout,
  onLayoutChange,
  onClose,
  lines,
  onAdvancePhase,
}: {
  layout: DebugPopupLayout
  onLayoutChange: (nextLayout: DebugPopupLayout) => void
  onClose: () => void
  lines: ReadonlyArray<ApiProtocolTrafficEntry>
  onAdvancePhase: () => void
}) {
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })

  function onMouseDown(e: React.MouseEvent) {
    setDragging(true)
    setOffset({ x: e.clientX - layout.position.x, y: e.clientY - layout.position.y })
    document.body.style.userSelect = 'none'
  }

  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setResizing(true)
    setResizeStart({ x: e.clientX, y: e.clientY, width: layout.size.width, height: layout.size.height })
    document.body.style.userSelect = 'none'
  }

  function onMouseMove(e: MouseEvent) {
    if (dragging) {
      onLayoutChange({
        position: { x: e.clientX - offset.x, y: e.clientY - offset.y },
        size: layout.size,
      })
    }
    if (resizing) {
      const deltaX = e.clientX - resizeStart.x
      const deltaY = e.clientY - resizeStart.y
      const newWidth = Math.max(250, resizeStart.width + deltaX)
      const newHeight = Math.max(200, resizeStart.height + deltaY)
      onLayoutChange({
        position: layout.position,
        size: { width: newWidth, height: newHeight },
      })
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

  return createPortal(
    <div
      className="debug-popup"
      style={{ left: layout.position.x, top: layout.position.y, width: layout.size.width, height: layout.size.height }}
    >
      <div className="debug-popup-header" onMouseDown={onMouseDown} style={{ cursor: 'move' }}>
        <span>Debug Diagnostics</span>
        <button className="debug-popup-close" onClick={onClose} title="Close debug window">×</button>
      </div>
      <div className="debug-popup-body">
        {lines.length === 0 ? (
          <div className="debug-line">No protocol traffic yet.</div>
        ) : (
          lines.map((entry) => (
            <section key={entry.id} className="debug-entry">
              <div className="debug-entry-summary">{formatDebugEntrySummary(entry)}</div>
              <div className="debug-json-print">
                <ReactJsonPrint dataObject={entry} depth={2} />
              </div>
            </section>
          ))
        )}
      </div>
      <div className="debug-popup-footer">
        <button
          className="debug-cycle-phase-btn"
          onClick={onAdvancePhase}
          title="Send END_PHASE to the backend"
        >
          Advance Phase
        </button>
      </div>
      <div className="debug-popup-resize" onMouseDown={onResizeMouseDown} title="Drag to resize">⤡</div>
    </div>,
    document.body,
  )
}

function App({ gameClient, gameId, liveEventSource, runtimeConfig, showConnectionGate = false }: AppProps) {
    // Debug diagnostics popup state
    const [debugOpen, setDebugOpen] = useState(false)
    const [debugPopupLayout, setDebugPopupLayout] = useState<DebugPopupLayout>(() => ({
      position: { x: window.innerWidth - 380, y: 90 },
      size: { width: 340, height: 400 },
    }))
    const [actionError, setActionError] = useState<string | null>(null)
    const [, setPendingCombatSnapshot] = useState<GameSnapshot | null>(null)
    const [pendingCombatResolution, setPendingCombatResolution] = useState<GameSnapshot['combatResolution'] | null>(null)
    const [combatBaseSnapshot, setCombatBaseSnapshot] = useState<GameSnapshot | null>(null)
    const [connectedSession, setConnectedSession] = useState<SessionBinding | null>(null)
    const [connectError, setConnectError] = useState<string | null>(null)
    const [connectDraft, setConnectDraft] = useState({
      apiBaseUrl: runtimeConfig?.apiBaseUrl ?? 'http://localhost:3000',
      username: '',
      password: '',
      gameId: runtimeConfig?.gameId?.toString() ?? '',
    })
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[] | null>(null)
  const [selectedCombatTargetId, setSelectedCombatTargetId] = useState<string | null>(null)

  const runtimeConnectionSeeded = showConnectionGate
  const liveRefreshQuietWindowMs = runtimeConfig?.liveRefreshQuietWindowMs ?? 500
  const previousSnapshotPhaseRef = useRef<TurnPhase | null>(null)

  const providedRequestTransport = useMemo(() => {
    if (gameClient === undefined) {
      return null
    }

    return createRequestTransportFromGameClient(gameClient)
  }, [gameClient])

  const activeSessionBinding = useMemo<SessionBinding | null>(() => {
    if (providedRequestTransport !== null && gameId !== undefined) {
      return {
        gameId,
        requestTransport: providedRequestTransport,
        liveEventSource: liveEventSource ?? idleLiveEventSource,
      }
    }

    return connectedSession
  }, [connectedSession, gameId, liveEventSource, providedRequestTransport])

  const activeSessionController = useMemo(() => {
    if (activeSessionBinding === null) {
      return null
    }

    return createGameSessionController({
      gameId: activeSessionBinding.gameId,
      requestTransport: activeSessionBinding.requestTransport,
      liveEventSource: activeSessionBinding.liveEventSource,
      liveRefreshQuietWindowMs,
    })
  }, [activeSessionBinding, liveRefreshQuietWindowMs])

  const sessionState = useGameSession(activeSessionController ?? idleSessionController, {
    autoLoad: activeSessionController !== null,
    disposeOnUnmount: true,
  })

  const clientSnapshot = combatBaseSnapshot ?? sessionState.snapshot
  const clientSession = sessionState.session
  const activeGameIdProp = activeSessionBinding?.gameId

  useEffect(() => {
    const nextSnapshotPhase = sessionState.snapshot?.phase ?? null
    const previousSnapshotPhase = previousSnapshotPhaseRef.current

    if (
      sessionState.snapshot === null
      || (previousSnapshotPhase !== null && previousSnapshotPhase !== nextSnapshotPhase)
      || !isCombatSnapshotPhase(nextSnapshotPhase)
    ) {
      setPendingCombatSnapshot(null)
      setPendingCombatResolution(null)
      setCombatBaseSnapshot(null)
      setSelectedCombatTargetId(null)
    }

    previousSnapshotPhaseRef.current = nextSnapshotPhase
  }, [sessionState.snapshot])

  function isCombatSnapshotPhase(phase: TurnPhase | null): boolean {
    return phase === 'ONION_COMBAT' || phase === 'DEFENDER_COMBAT'
  }
  const isControlledSession = activeSessionBinding !== null
  const activePhase = clientSnapshot?.phase ?? null
  const selectedSnapshotUnitId = clientSnapshot?.selectedUnitId ?? null
  const activeSelectedUnitIds = selectedUnitIds ?? (selectedSnapshotUnitId ? [selectedSnapshotUnitId] : [])
  const headerHasSnapshot = clientSnapshot !== null
  const activeTurnNumber = clientSnapshot?.turnNumber ?? null
  const activeScenarioName = clientSnapshot?.scenarioName ?? null
  const activeRole = clientSession?.role ?? null
  const activeGameId = clientSnapshot?.gameId ?? activeGameIdProp ?? null
  const activePhaseOwner = getPhaseOwner(activePhase)
  const activeTurnActive = headerHasSnapshot && activeRole !== null && activePhaseOwner === activeRole
  const phaseAdvanceLabel = getPhaseAdvanceLabel(activePhase, activeRole)
  const shellPhase = activePhase ?? 'DEFENDER_MOVE'
  const activePhaseLabel = activePhase === null ? 'WAITING' : turnPhaseLabels[activePhase]
  const activeMode: Mode = clientSnapshot?.mode ?? 'fire'
  const isCombatPhase = activePhase === 'ONION_COMBAT' || activePhase === 'DEFENDER_COMBAT'
  const activeCombatRole = activePhase === null ? null : activePhase.startsWith('ONION_') ? 'onion' : activePhase.startsWith('DEFENDER_') ? 'defender' : null
  const isMovementPhase = activePhase === 'ONION_MOVE' || activePhase === 'DEFENDER_MOVE' || activePhase === 'GEV_SECOND_MOVE'
  const displayedScenarioMap = buildScenarioMap(clientSnapshot)
  const selectedCombatAttackerIds = !isCombatPhase
    ? []
    : activeCombatRole === 'onion'
      ? activeSelectedUnitIds.filter(isWeaponSelectionId).map(stripWeaponSelectionId)
      : [...activeSelectedUnitIds]

  async function commitClientAction(action: GameAction) {
    if (!isControlledSession || activeSessionController === null) {
      return
    }

    try {
      const previousSnapshot = clientSnapshot
      const nextSnapshot = await activeSessionController.submitAction(action)
      setActionError(null) // clear any previous error
      if (nextSnapshot?.combatResolution !== undefined) {
        setCombatBaseSnapshot(previousSnapshot)
        setPendingCombatSnapshot(nextSnapshot)
        setPendingCombatResolution(nextSnapshot.combatResolution)
        return
      }

      setCombatBaseSnapshot(null)
      setPendingCombatSnapshot(null)
      setPendingCombatResolution(null)
      if (nextSnapshot !== null && !isCombatSnapshotPhase(nextSnapshot.phase)) {
        setSelectedCombatTargetId(null)
      }
    } catch (error: unknown) {
      // Surface error to UI
      const errorMessage =
        error instanceof GameClientSeamError
          ? `GameClientSeamError: ${error.message}`
          : error instanceof Error && error.message
          ? `Error: ${error.message}`
          : 'Error unknown'
      setActionError(`Failed to submit action: ${errorMessage}`)
      if (action.type === 'FIRE' && activeSessionController !== null) {
        setPendingCombatSnapshot(null)
        setPendingCombatResolution(null)
        setCombatBaseSnapshot(null)
        setSelectedUnitIds([])
        setSelectedCombatTargetId(null)

        try {
          await activeSessionController.refresh()
        } catch {
          // Keep the error banner; the user can retry or refresh manually.
        }
      }
      // Do not update clientSnapshot on failure
    }
  }

  function clearPendingCombatResolution(clearSelection: boolean) {
    setCombatBaseSnapshot(null)
    setPendingCombatSnapshot(null)
    setPendingCombatResolution(null)

    if (clearSelection) {
      setSelectedUnitIds([])
      setSelectedCombatTargetId(null)
    }
  }

  function handleDismissCombatResolution() {
    clearPendingCombatResolution(true)
  }

  function handleConfirmCombat() {
    if (selectedCombatTarget === null || selectedCombatAttackerIds.length === 0 || displayedOnion === null) {
      return
    }

    const targetId = buildCombatTargetActionId(selectedCombatTarget.id, displayedOnion.id)
    void commitClientAction({ type: 'FIRE', attackers: selectedCombatAttackerIds, targetId })
  }

  function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setConnectError(null)

    if (!connectDraft.apiBaseUrl.trim() || !connectDraft.username.trim() || !connectDraft.password.trim() || !connectDraft.gameId.trim()) {
      setConnectError('API base URL, username, password, and game ID are required.')
      return
    }

    const parsedGameId = Number(connectDraft.gameId.trim())
    if (!Number.isSafeInteger(parsedGameId) || parsedGameId <= 0) {
      setConnectError('Game ID must be a positive integer.')
      return
    }

    void (async () => {
      const loginResult = await requestJson<AuthResponse>({
        baseUrl: connectDraft.apiBaseUrl.trim(),
        path: 'auth/login',
        method: 'POST',
        body: {
          username: connectDraft.username.trim(),
          password: connectDraft.password,
        },
      })

      if (!loginResult.ok) {
        setConnectError(loginResult.message)
        return
      }

      const baseUrl = connectDraft.apiBaseUrl.trim()
      const requestTransport = createHttpGameRequestTransport({
        baseUrl,
        token: loginResult.data.token,
      })
      const nextLiveEventSource = createLiveEventSource({
        baseUrl,
        token: loginResult.data.token,
      })

      setConnectedSession({
        requestTransport,
        liveEventSource: nextLiveEventSource,
        gameId: parsedGameId,
      })
    })().catch(() => {
      setConnectError('Unable to connect to the backend.')
    })
  }

  function handleSelectUnit(unitId: string, additive = false) {
    if (displayedDefenders.some((unit) => unit.id === unitId && unit.status === 'destroyed')) {
      return
    }

    clearPendingCombatResolution(false)

    setSelectedUnitIds((currentSelection) => {
      const baseSelection = currentSelection ?? (clientSnapshot?.selectedUnitId ? [clientSnapshot.selectedUnitId] : [])

      if (!additive) {
        return [unitId]
      }

      if (baseSelection.includes(unitId)) {
        return baseSelection.filter((selectedId) => selectedId !== unitId)
      }

      return [...baseSelection, unitId]
    })
    setSelectedCombatTargetId(null)
    setActionError(null)
  }

  function handleDeselectUnit() {
    clearPendingCombatResolution(false)
    setSelectedUnitIds([])
    setSelectedCombatTargetId(null)
    setActionError(null)
  }

  async function handleMoveUnit(unitId: string, to: { q: number; r: number }) {
    if (!isControlledSession || activeSessionController === null) {
      return
    }

    if (!activeTurnActive) {
      return
    }

    setActionError(null)
    try {
      await activeSessionController.submitAction({ type: 'MOVE', unitId, to })
      setSelectedUnitIds([])
    } catch (error: unknown) {
      const errorMessage =
        error instanceof GameClientSeamError
          ? `GameClientSeamError: ${error.message}`
          : error instanceof Error && error.message
            ? `Error: ${error.message}`
            : 'Error unknown'
      setActionError(`Failed to submit action: ${errorMessage}`)
    }
  }

  const authoritativeState = clientSnapshot?.authoritativeState ?? null
  const scenarioMapSnapshot = clientSnapshot?.scenarioMap ?? null
  const movementRemainingSnapshot = clientSnapshot?.movementRemainingByUnit ?? null
  const displayedDefenders = authoritativeState === null ? [] : buildLiveDefenders({
    authoritativeState,
    scenarioMap: scenarioMapSnapshot,
    movementRemainingByUnit: movementRemainingSnapshot,
  } as GameSnapshot, activePhase, activeTurnActive)
  const displayedOnion = clientSnapshot === null ? null : buildLiveOnion(clientSnapshot, activePhase)
  const onionWeapons = parseWeaponStats(displayedOnion?.weapons ?? '')
  const readyWeaponDetails = displayedOnion?.weaponDetails?.filter((weapon) => weapon.status === 'ready') ?? []
  const selectedCombatAttackStrength = !isCombatPhase
    ? 0
    : activeCombatRole === 'onion'
      ? (displayedOnion?.weaponDetails ?? [])
        .filter((weapon) => weapon.status === 'ready' && selectedCombatAttackerIds.includes(weapon.id))
        .reduce((total, weapon) => total + weapon.attack, 0)
      : displayedDefenders
        .filter((unit) => activeSelectedUnitIds.includes(unit.id))
        .reduce((total, unit) => total + parseRangeValue(parseAttackStats(unit.attack).damage), 0)
  const selectedCombatAttackLabel = selectedCombatAttackStrength > 0 ? `Attack ${selectedCombatAttackStrength}` : 'Attack 0'
  const selectedCombatAttackCount = selectedCombatAttackerIds.length
  const selectedInspectorUnitId = activeSelectedUnitIds.find((selectionId) => !isWeaponSelectionId(selectionId)) ?? null
  const selectedInspectorOnion = selectedInspectorUnitId !== null && selectedInspectorUnitId === displayedOnion?.id ? displayedOnion : null
  const selectedInspectorDefender =
    selectedInspectorOnion !== null || selectedInspectorUnitId === null
      ? null
      : displayedDefenders.find((unit) => unit.id === selectedInspectorUnitId) ?? null
  const combatRangeHexKeys = !isCombatPhase || displayedScenarioMap === null
    ? new Set<string>()
    : buildCombatRangeHexKeys(
      buildCombatRangeSources(activePhase, activeCombatRole, activeSelectedUnitIds, displayedDefenders, displayedOnion),
      displayedScenarioMap,
    )
  const combatTargetOptions = buildCombatTargetOptions({
    activeCombatRole,
    combatRangeHexKeys,
    displayedDefenders,
    displayedOnion,
    selectedUnitIds: activeSelectedUnitIds,
    selectedAttackStrength: selectedCombatAttackStrength,
    displayedScenarioMap,
  })
  const combatTargetIds = new Set(combatTargetOptions.map((target) => target.id))
  const selectedCombatTargetIdForRender = selectedCombatTargetId !== null && combatTargetIds.has(selectedCombatTargetId) ? selectedCombatTargetId : null
  const selectedCombatTarget = selectedCombatTargetIdForRender === null ? null : combatTargetOptions.find((target) => target.id === selectedCombatTargetIdForRender) ?? null

  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const connectionStatus = sessionState.liveConnection
  const connectionLabel = formatLiveConnectionStatus(connectionStatus)
  const lastUpdatedAt = sessionState.lastUpdatedAt ?? lastRefreshAt

  useSyncExternalStore(
    (onStoreChange) => {
      if (!debugOpen) {
        return () => {}
      }

      return subscribeApiProtocolTraffic(() => {
        onStoreChange()
      })
    },
    () => (debugOpen ? getApiProtocolTrafficVersion() : 0),
    () => 0,
  )
  const debugEntries = debugOpen
    ? getApiProtocolTrafficSnapshot()
      .slice()
      .reverse()
      .slice(0, 400)
      .map((entry) => sanitizeApiProtocolTrafficEntry(entry))
    : []

  async function handleRefresh() {
    setIsRefreshing(true)
    if (activeSessionController !== null) {
      try {
        await activeSessionController.refresh()
        setLastRefreshAt(new Date())
      } finally {
        setIsRefreshing(false)
      }
      return
    }

    setTimeout(() => {
      setLastRefreshAt(new Date())
      setIsRefreshing(false)
    }, 800)
  }

  if (!isControlledSession && runtimeConnectionSeeded) {
    return (
      <div className="shell connect-shell">
        <section className="panel connect-panel">
          <div className="card-head">
            <div>
              <p className="eyebrow">Connect</p>
              <h1>Open a live game session</h1>
            </div>
          </div>
          <form className="connect-form" onSubmit={handleConnect}>
            <label className="connect-field">
              <span className="stat-label">API base URL</span>
              <input
                value={connectDraft.apiBaseUrl}
                onChange={(event) => setConnectDraft((draft) => ({ ...draft, apiBaseUrl: event.target.value }))}
                placeholder="http://localhost:3000"
              />
            </label>
            <label className="connect-field">
              <span className="stat-label">Username</span>
              <input
                value={connectDraft.username}
                onChange={(event) => setConnectDraft((draft) => ({ ...draft, username: event.target.value }))}
                placeholder="player-1"
              />
            </label>
            <label className="connect-field">
              <span className="stat-label">Password</span>
              <input
                type="password"
                value={connectDraft.password}
                onChange={(event) => setConnectDraft((draft) => ({ ...draft, password: event.target.value }))}
                placeholder="••••••••"
              />
            </label>
            <label className="connect-field">
              <span className="stat-label">Game ID</span>
              <input
                value={connectDraft.gameId}
                onChange={(event) => setConnectDraft((draft) => ({ ...draft, gameId: event.target.value }))}
                placeholder="123"
              />
            </label>
            {connectError && <p className="connect-error" role="alert">{connectError}</p>}
            <button type="submit" className="primary-action">Load Game</button>
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className="shell" data-phase={shellPhase}>
      {/* Show action error as a toast/banner if present */}
      {actionError && (
        <div className="action-error-banner" role="alert" style={{ background: '#fbeaea', color: '#a94442', padding: '8px 16px', marginBottom: 8, borderRadius: 4, textAlign: 'center', fontWeight: 500 }}>
          {actionError}
        </div>
      )}
      {pendingCombatResolution && selectedCombatTarget !== null ? (
        <CombatResolutionToast
          title={`Combat resolved on ${selectedCombatTarget.label}`}
          resolution={pendingCombatResolution}
          modifiers={selectedCombatTarget.modifiers}
          onDismiss={handleDismissCombatResolution}
        />
      ) : null}
      <header className="topbar panel">
        <div
          className={`role-badge ${
            headerHasSnapshot
              ? activeTurnActive
                ? activeRole === 'defender'
                  ? 'role-badge-active role-badge-defender'
                  : 'role-badge-active role-badge-onion'
                : activeRole === 'defender'
                  ? 'role-badge-inactive role-badge-defender'
                  : 'role-badge-inactive role-badge-onion'
              : 'role-badge-waiting'
          }`}
        >
          {activeRole === 'defender' ? 'Defender' : activeRole === 'onion' ? 'Onion' : 'Waiting'}
        </div>
        <div className="topbar-state">
          <div className={`phase-chip phase-chip-turn${headerHasSnapshot ? '' : ' phase-chip-waiting'}`}>
            <span>Turn {activeTurnNumber ?? 'waiting'}</span>
          </div>
          <div className={`phase-chip phase-chip-state${activeTurnActive ? ' phase-chip-active' : ''}${headerHasSnapshot ? '' : ' phase-chip-waiting'}`}>
            <span>{headerHasSnapshot ? activePhaseLabel : 'WAITING'}</span>
          </div>
          {phaseAdvanceLabel !== null ? (
            <button
              type="button"
              className="phase-advance-btn"
              onClick={() => {
                void commitClientAction({ type: 'end-phase' })
              }}
            >
              {phaseAdvanceLabel}
            </button>
          ) : null}
        </div>
        <div className="header-utility-controls">
          <div className="utility-group-vert">
            <div>
              <span className="stat-label-small">Scenario</span>
              <strong className={headerHasSnapshot ? '' : 'header-waiting'}>{activeScenarioName ?? 'Waiting for game state'}</strong>
            </div>
            <div>
              <span className="stat-label-small">Game ID</span>
              <strong className={headerHasSnapshot ? '' : 'header-waiting'}>{activeGameId ?? 'Waiting'}</strong>
            </div>
          </div>
          <div className="utility-group-vert">
            <button
              className="refresh-btn"
              title="Refresh game state"
              onClick={() => {
                void handleRefresh()
              }}
              aria-label="Refresh"
              disabled={isRefreshing}
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
            <div className="sync-status-block" title={`Live connection: ${connectionLabel}`}>
              <span className="stat-label-small">Connection</span>
              <span className={`connection-status connection-status-${connectionStatus}`}>
                {connectionLabel}
              </span>
            </div>
            <div className="last-sync-block" title="Last live update time">
              <span className="stat-label-small">Last</span>
              <span className="last-sync">
                {lastUpdatedAt === null ? '—' : lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </header>

      {debugOpen && (
        <DraggableDebugPopup
          layout={debugPopupLayout}
          onLayoutChange={setDebugPopupLayout}
          onClose={() => setDebugOpen(false)}
          lines={debugEntries}
          onAdvancePhase={() => {
            void commitClientAction({ type: 'end-phase' })
          }}
        />
      )}

      <main className="battlefield-grid" onClick={handleDeselectUnit}>
        <aside className="panel rail rail-left">
          {isCombatPhase ? (
            <section className="section-block combat-scaffold">
              <div className="card-head">
                <div>
                  <p className="eyebrow">Combat</p>
                  <h2 title={activeCombatRole === 'onion'
                    ? 'Pick one or more eligible weapons from the rail. Ctrl+click adds or removes weapons from the attack group.'
                    : 'Pick one or more eligible units from the rail or board. Ctrl+click adds or removes units from the attack group.'
                  }>
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
                          className={`attacker-card-button ${isSelected ? 'is-selected' : ''}`}
                          aria-pressed={isSelected}
                          data-selected={isSelected}
                          data-testid={`combat-weapon-${weapon.id}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            handleSelectUnit(selectionId, event.ctrlKey || event.metaKey)
                          }}
                        >
                          <div className="combat-card-header">
                            <span className="combat-card-type"><strong>{weapon.name}</strong></span>
                            <span className="combat-card-id">{weapon.id}</span>
                          </div>
                          <div className="combat-card-stats">Attack: {weapon.attack} · Range: {weapon.range}</div>
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
                        disabled={isDisabled}
                        title={isDestroyed ? 'Destroyed units cannot attack.' : !isActionable ? 'This unit is not eligible to attack.' : undefined}
                        onClick={(event) => {
                          if (isDisabled) {
                            event.stopPropagation()
                            return
                          }

                          event.stopPropagation()
                          handleSelectUnit(unit.id, event.ctrlKey || event.metaKey)
                        }}
                      >
                        <div className="combat-card-header">
                          <span className="combat-card-type"><strong>{unit.type}</strong></span>
                          <span className="combat-card-id">{unit.id}</span>
                        </div>
                        <div className="combat-card-stats">Attack: {attackStats.damage} · Range: {attackStats.range}</div>
                      </button>
                    )
                  })
                ) : (
                  <p className="summary-line">Waiting for battlefield data.</p>
                )}
              </div>
            </section>
          ) : isMovementPhase ? (
            activeRole === 'onion' ? (
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
                      handleSelectUnit(displayedOnion.id, event.ctrlKey || event.metaKey)
                    }}
                  >
                    <h3>{displayedOnion.id}</h3>
                    <div className="unit-summary">
                      <div className="summary-line">
                        <span>Treads <strong>{displayedOnion.treads}</strong></span>
                        <span>Moves <strong>{displayedOnion.movesRemaining}</strong></span>
                        <span>Rams <strong>{displayedOnion.rams}</strong></span>
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
            ) : activeRole === 'defender' ? (
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
                            handleSelectUnit(unit.id, event.ctrlKey || event.metaKey)
                          }}
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
                ) : (
                  <p className="summary-line">Waiting for battlefield data.</p>
                )}
              </section>
            ) : null
          ) : null}
        </aside>

        <section className="panel map-stage">
          <div className="map-frame">
            {displayedScenarioMap && displayedOnion ? (
              <HexMapBoard
                scenarioMap={displayedScenarioMap}
                defenders={displayedDefenders}
                onion={displayedOnion}
                phase={activePhase}
                selectedUnitIds={activeSelectedUnitIds}
                selectedCombatTargetId={selectedCombatTargetId}
                combatRangeHexKeys={combatRangeHexKeys}
                combatTargetIds={combatTargetIds}
                canSubmitMove={
                  activeTurnActive && (
                    activePhase === 'ONION_MOVE' ||
                    activePhase === 'DEFENDER_MOVE' ||
                    activePhase === 'GEV_SECOND_MOVE'
                  )
                }
                onSelectUnit={handleSelectUnit}
                onSelectCombatTarget={(targetId) => setSelectedCombatTargetId(targetId)}
                onDeselect={handleDeselectUnit}
                onMoveUnit={handleMoveUnit}
              />
            ) : (
              <div className="hex-map-shell panel-subtle">
                <p className="summary-line">Battlefield will appear once the game state loads.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="panel rail rail-right">
          {isCombatPhase ? (
            <section className="section-block panel-subtle">
              <div className="card-head">
                <div>
                  <p className="eyebrow">Combat</p>
                  <h2 title="Pick a target from the list. The list only includes targets currently in the active attack range.">
                    Valid Targets
                  </h2>
                </div>
                <span className="mini-tag">{combatTargetOptions.length} in range</span>
              </div>
              {selectedCombatTarget !== null ? (
                <CombatConfirmationView
                  title={`Confirm attack on ${selectedCombatTarget.label}`}
                  attackStrength={selectedCombatAttackStrength}
                  defenseStrength={selectedCombatTarget.defense}
                  modifiers={selectedCombatTarget.modifiers}
                  confirmLabel="Resolve combat"
                  onConfirm={handleConfirmCombat}
                  dataTestId="combat-confirmation-view"
                />
              ) : null}
              {combatTargetOptions.length > 0 ? (
                <div className="attacker-selection-list" data-testid="combat-target-list">
                  {combatTargetOptions.map((target) => {
                    const isSelected = selectedCombatTargetId === target.id
                    const isTreadsTarget = target.id.endsWith(':treads')
                    const isGroupAttackOnTreads = isTreadsTarget && selectedCombatAttackCount > 1
                    return (
                      <button
                        key={target.id}
                        type="button"
                        className={[
                          'attacker-card-button',
                          isSelected ? 'is-selected' : '',
                          isGroupAttackOnTreads ? 'is-disabled' : '',
                          `tone-${statusTone(target.status)}`,
                        ].join(' ')}
                        disabled={isGroupAttackOnTreads}
                        title={isGroupAttackOnTreads ? 'Treads must be singly targeted.' : undefined}
                        aria-pressed={isSelected}
                        aria-disabled={isGroupAttackOnTreads}
                        data-selected={isSelected}
                        data-testid={`combat-target-${target.id}`}
                        onClick={(event) => {
                          if (isGroupAttackOnTreads) {
                            event.preventDefault()
                            event.stopPropagation()
                            return
                          }

                          event.stopPropagation()
                          setSelectedCombatTargetId(target.id)
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          event.stopPropagation()

                          if (isGroupAttackOnTreads) {
                            return
                          }

                          setSelectedCombatTargetId(target.id)
                        }}
                      >
                        <div className="combat-card-header">
                          <span className="combat-card-type"><strong>{target.label}</strong></span>
                          <span className="combat-card-id">{target.id}</span>
                        </div>
                        <div className="combat-card-stats">{target.detail}</div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="summary-line">No valid targets are currently in range.</p>
              )}
            </section>
          ) : isMovementPhase ? (
            <section className="selection-panel panel-subtle">
              <div className="selection-panel-header">
                <div>
                  <p className="eyebrow">Inspector</p>
                </div>
              </div>
              <div className="empty-state">Select a unit on the map or in the rail to inspect it here.</div>
            </section>
          ) : selectedInspectorOnion !== null ? (
            <section className="selection-panel panel-subtle">
              <div className="selection-panel-header">
                <div>
                  <p className="eyebrow">Inspector</p>
                  <h2>{selectedInspectorOnion.id}</h2>
                </div>
                <span className="mini-tag">Selected</span>
              </div>
              <dl className="inspector-grid inspector-grid-right">
                <div>
                  <dt>Type</dt>
                  <dd>{selectedInspectorOnion.type}</dd>
                </div>
                <div>
                  <dt>Treads</dt>
                  <dd>{selectedInspectorOnion.treads}</dd>
                </div>
                <div>
                  <dt>Moves</dt>
                  <dd>{selectedInspectorOnion.movesRemaining}</dd>
                </div>
                <div>
                  <dt>Rams</dt>
                  <dd>{selectedInspectorOnion.rams}</dd>
                </div>
                <div>
                  <dt>Weapons</dt>
                  <dd>{parseWeaponStats(selectedInspectorOnion.weapons ?? '').operationalWeapons}</dd>
                </div>
                <div>
                  <dt>Missiles</dt>
                  <dd>{parseWeaponStats(selectedInspectorOnion.weapons ?? '').operationalMissiles}</dd>
                </div>
              </dl>
            </section>
          ) : selectedInspectorDefender !== null ? (
            <section className="selection-panel panel-subtle">
              <div className="selection-panel-header">
                <div>
                  <p className="eyebrow">Inspector</p>
                  <h2>{selectedInspectorDefender.id}</h2>
                </div>
                <span className="mini-tag">Selected</span>
              </div>
              <dl className="inspector-grid inspector-grid-right">
                <div>
                  <dt>Type</dt>
                  <dd>{selectedInspectorDefender.type}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{selectedInspectorDefender.status}</dd>
                </div>
                <div>
                  <dt>Damage</dt>
                  <dd>{parseAttackStats(selectedInspectorDefender.attack).damage}</dd>
                </div>
                <div>
                  <dt>Range</dt>
                  <dd>{parseAttackStats(selectedInspectorDefender.attack).range}</dd>
                </div>
                <div>
                  <dt>Move</dt>
                  <dd>{selectedInspectorDefender.move}</dd>
                </div>
                <div>
                  <dt>Selected</dt>
                  <dd>{activeSelectedUnitIds.length}</dd>
                </div>
              </dl>
            </section>
          ) : (
            <section className="selection-panel panel-subtle">
              <div className="selection-panel-header">
                <div>
                  <p className="eyebrow">Inspector</p>
                </div>
              </div>
              <div className="empty-state">Select a unit on the map or in the rail to inspect it here.</div>
            </section>
          )}
        </aside>
      </main>
    </div>
  )
}

export default App
