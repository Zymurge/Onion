import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react'
import { HexMapBoard } from './components/HexMapBoard'
import { CombatConfirmationView } from './components/CombatConfirmationView'
import { CombatResolutionToast } from './components/CombatResolutionToast'
import {
  GameClientSeamError,
  type GameAction,
  type GameClient,
  type GameSessionContext,
  type GameSnapshot,
} from './lib/gameClient'
import {
  statusTone,
  type BattlefieldOnionView,
  type BattlefieldUnit,
  type Mode,
  type TerrainHex,
} from './lib/battlefieldView'
import { createHttpGameClient } from './lib/httpGameClient'
import { buildCombatRangeHexKeys } from './lib/combatRange'
import { buildCombatTargetOptions } from './lib/combatPreview'
import type { WebRuntimeConfig } from './lib/appBootstrap'
import { requestJson } from '../../src/shared/apiProtocol'
import { getUnitMovementAllowance } from '../../src/shared/unitMovement'
import type { TurnPhase, UnitStatus, Weapon } from '../../src/types/index'
import './App.css'

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
    .map(([defenderId, defender], index) => ({
      id: defender.id ?? defenderId,
      type: defender.type,
      status: defender.status,
      q: defender.position.q,
      r: defender.position.r,
      move: activePhase === null ? 0 : movementRemainingByUnit[defender.id ?? defenderId] ?? 0,
      weapons: formatWeaponSummary(defender.weapons),
      attack: formatAttackSummary(defender.weapons),
      weaponDetails: defender.weapons ?? [],
      targetRules: defender.targetRules,
      defense: getDisplayDefense(defender.type, defender.squads, getTerrainTypeAt(snapshot.scenarioMap, defender.position.q, defender.position.r)),
      squads: defender.squads,
      actionableModes: getActionableModes(defender.status, defender.weapons, activeTurnActive),
      rosterOrder: index,
    }))
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
  const movesRemaining =
    activePhase === null
      ? 0
      : movementRemainingByUnit[onion.id ?? 'onion-1'] ?? getUnitMovementAllowance('TheOnion', activePhase, onion.treads)

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
  runtimeConfig?: WebRuntimeConfig
  showConnectionGate?: boolean
}

type AuthResponse = {
  userId: string
  token: string
}

function App({ gameClient, gameId, runtimeConfig, showConnectionGate = false }: AppProps) {

    // Debug diagnostics popup state
    const [debugOpen, setDebugOpen] = useState(false)
    const mockDebugLines = [
      '[12:00:01] [info] Game state loaded',
      '[12:00:02] [debug] Map rendered',
      '[12:00:03] [info] User selected unit wolf-2',
      '[12:00:04] [debug] Combat selection scaffold ready',
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
      '[12:00:15] [info] Left rail combat lists initialized for attacker selection',
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
    const [clientSnapshot, setClientSnapshot] = useState<GameSnapshot | null>(null)
    const [clientSession, setClientSession] = useState<GameSessionContext | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [pendingCombatSnapshot, setPendingCombatSnapshot] = useState<GameSnapshot | null>(null)
    const [pendingCombatResolution, setPendingCombatResolution] = useState<GameSnapshot['combatResolution'] | null>(null)
    const [connectedSession, setConnectedSession] = useState<{ gameClient: GameClient; gameId: number } | null>(null)
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
  const activeGameClient = gameClient ?? connectedSession?.gameClient
  const activeGameIdProp = gameId ?? connectedSession?.gameId
  const snapshotLoadVersion = useRef(0)

  useEffect(() => {
    if (activeGameClient === undefined || activeGameIdProp === undefined) {
      setClientSnapshot(null)
      setClientSession(null)
      return
    }

    let cancelled = false
    const loadVersion = ++snapshotLoadVersion.current

    void activeGameClient
      .getState(activeGameIdProp)
      .then((state) => {
        if (!cancelled && snapshotLoadVersion.current === loadVersion) {
          setClientSnapshot(state.snapshot)
          setClientSession(state.session)
        }
      })
      .catch((error) => {
        // Handle errors from getState to avoid unhandled promise rejections
        if (!cancelled && snapshotLoadVersion.current === loadVersion) {
          console.error('Failed to load game state', error)
          setClientSnapshot(null)
          setClientSession(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeGameClient, activeGameIdProp])

  const isControlledSession = activeGameClient !== undefined && activeGameIdProp !== undefined
  const activePhase = clientSnapshot?.phase ?? null
  const selectedSnapshotUnitId = clientSnapshot?.selectedUnitId ?? null
  const activeSelectedUnitIds = useMemo(
    () => selectedUnitIds ?? (selectedSnapshotUnitId ? [selectedSnapshotUnitId] : []),
    [selectedSnapshotUnitId, selectedUnitIds],
  )
  const headerHasSnapshot = clientSnapshot !== null
  const activeTurnNumber = clientSnapshot?.turnNumber ?? null
  const activeScenarioName = clientSnapshot?.scenarioName ?? null
  const activeRole = clientSession?.role ?? null
  const activeGameId = clientSnapshot?.gameId ?? activeGameIdProp ?? null
  const activePhaseOwner = getPhaseOwner(activePhase)
  const activeTurnActive = headerHasSnapshot && activeRole !== null && activePhaseOwner === activeRole
  const shellPhase = activePhase ?? 'DEFENDER_MOVE'
  const activePhaseLabel = activePhase === null ? 'WAITING' : turnPhaseLabels[activePhase]
  const activeMode: Mode = clientSnapshot?.mode ?? 'fire'
  const isCombatPhase = activePhase === 'ONION_COMBAT' || activePhase === 'DEFENDER_COMBAT'
  const activeCombatRole = activePhase === null ? null : activePhase.startsWith('ONION_') ? 'onion' : activePhase.startsWith('DEFENDER_') ? 'defender' : null
  const displayedScenarioMap = buildScenarioMap(clientSnapshot)
  const selectedCombatAttackerIds = useMemo(() => {
    if (!isCombatPhase) {
      return []
    }

    if (activeCombatRole === 'onion') {
      return activeSelectedUnitIds.filter(isWeaponSelectionId).map(stripWeaponSelectionId)
    }

    return [...activeSelectedUnitIds]
  }, [activeCombatRole, activeSelectedUnitIds, isCombatPhase])

  async function commitClientAction(action: GameAction) {
    if (!isControlledSession || activeGameClient === undefined || activeGameIdProp === undefined) {
      return
    }

    snapshotLoadVersion.current += 1
    try {
      const nextSnapshot = await activeGameClient.submitAction(activeGameIdProp, action)
      setActionError(null) // clear any previous error
      if (nextSnapshot.combatResolution !== undefined) {
        setPendingCombatSnapshot(nextSnapshot)
        setPendingCombatResolution(nextSnapshot.combatResolution)
        return
      }

      setPendingCombatSnapshot(null)
      setPendingCombatResolution(null)
      setClientSnapshot(nextSnapshot)
    } catch (error: unknown) {
      // Surface error to UI
      const errorMessage =
        error instanceof GameClientSeamError
          ? `GameClientSeamError: ${error.message}`
          : error instanceof Error && error.message
          ? `Error: ${error.message}`
          : 'Error unknown'
      setActionError(`Failed to submit action: ${errorMessage}`)
      if (action.type === 'FIRE' && activeGameClient !== undefined && activeGameIdProp !== undefined) {
        setPendingCombatSnapshot(null)
        setPendingCombatResolution(null)
        setSelectedUnitIds([])
        setSelectedCombatTargetId(null)

        try {
          const refreshedState = await activeGameClient.getState(activeGameIdProp)
          setClientSnapshot(refreshedState.snapshot)
          setClientSession(refreshedState.session)
        } catch {
          // Keep the error banner; the user can retry or refresh manually.
        }
      }
      // Do not update clientSnapshot on failure
    }
  }

  function clearPendingCombatResolution(clearSelection: boolean) {
    if (pendingCombatSnapshot !== null) {
      setClientSnapshot(pendingCombatSnapshot)
    }

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

      const nextClient = createHttpGameClient({
        baseUrl: connectDraft.apiBaseUrl.trim(),
        token: loginResult.data.token,
      })

      setConnectedSession({
        gameClient: nextClient,
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
    if (!isControlledSession || activeGameClient === undefined || activeGameIdProp === undefined) {
      return
    }

    if (!activeTurnActive) {
      return
    }

    setActionError(null)
    snapshotLoadVersion.current += 1
    try {
      const nextSnapshot = await activeGameClient.submitAction(activeGameIdProp, { type: 'MOVE', unitId, to })
      setClientSnapshot(nextSnapshot)
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
  const displayedDefenders = useMemo(
    () => (authoritativeState === null ? [] : buildLiveDefenders({
      authoritativeState,
      scenarioMap: scenarioMapSnapshot,
      movementRemainingByUnit: movementRemainingSnapshot,
    } as GameSnapshot, activePhase, activeTurnActive)),
    [activePhase, activeTurnActive, authoritativeState, movementRemainingSnapshot, scenarioMapSnapshot],
  )
  const displayedOnion = clientSnapshot === null ? null : buildLiveOnion(clientSnapshot, activePhase)
  const onionWeapons = parseWeaponStats(displayedOnion?.weapons ?? '')
  const readyWeaponDetails = displayedOnion?.weaponDetails?.filter((weapon) => weapon.status === 'ready') ?? []
  const selectedCombatAttackStrength = useMemo(() => {
    if (!isCombatPhase) {
      return 0
    }

    if (activeCombatRole === 'onion') {
      return (displayedOnion?.weaponDetails ?? [])
        .filter((weapon) => weapon.status === 'ready' && selectedCombatAttackerIds.includes(weapon.id))
        .reduce((total, weapon) => total + weapon.attack, 0)
    }

    return displayedDefenders
      .filter((unit) => activeSelectedUnitIds.includes(unit.id))
      .reduce((total, unit) => total + parseRangeValue(parseAttackStats(unit.attack).damage), 0)
  }, [activeCombatRole, activeSelectedUnitIds, displayedDefenders, displayedOnion, isCombatPhase, selectedCombatAttackerIds])
  const selectedCombatAttackLabel = selectedCombatAttackStrength > 0 ? `Attack ${selectedCombatAttackStrength}` : 'Attack 0'
  const selectedCombatAttackCount = useMemo(() => {
    return selectedCombatAttackerIds.length
  }, [selectedCombatAttackerIds])
  const combatRangeHexKeys = useMemo(() => {
    if (!isCombatPhase || displayedScenarioMap === null) {
      return new Set<string>()
    }

    const combatSources = buildCombatRangeSources(activePhase, activeCombatRole, activeSelectedUnitIds, displayedDefenders, displayedOnion)
    return buildCombatRangeHexKeys(combatSources, displayedScenarioMap)
  }, [activePhase, activeCombatRole, activeSelectedUnitIds, displayedDefenders, displayedOnion, displayedScenarioMap, isCombatPhase])
  const combatTargetOptions = useMemo(
    () => buildCombatTargetOptions({
      activeCombatRole,
      combatRangeHexKeys,
      displayedDefenders,
      displayedOnion,
      selectedUnitIds: activeSelectedUnitIds,
      selectedAttackStrength: selectedCombatAttackStrength,
      displayedScenarioMap,
    }),
    [activeCombatRole, activeSelectedUnitIds, combatRangeHexKeys, displayedDefenders, displayedOnion, selectedCombatAttackStrength, displayedScenarioMap],
  )
  const combatTargetIds = useMemo(() => new Set(combatTargetOptions.map((target) => target.id)), [combatTargetOptions])
  const selectedCombatTarget = selectedCombatTargetId === null ? null : combatTargetOptions.find((target) => target.id === selectedCombatTargetId) ?? null

  useEffect(() => {
    if (selectedCombatTargetId !== null && !combatTargetOptions.some((target) => target.id === selectedCombatTargetId)) {
      setSelectedCombatTargetId(null)
    }
  }, [combatTargetOptions, selectedCombatTargetId])

  // Simulated last sync and event status for UI demo
  const [lastSync, setLastSync] = useState<Date>(new Date())
  const [eventStatus, setEventStatus] = useState<'ok' | 'fetching' | 'error'>('ok')

  function handleRefresh() {
    if (isControlledSession) {
      setEventStatus('fetching')
      void commitClientAction({ type: 'refresh' }).then(() => {
        setLastSync(new Date())
        setEventStatus('ok')
      }).catch(() => {
        setEventStatus('error')
      })
      return
    }

    setEventStatus('fetching')
    setTimeout(() => {
      setLastSync(new Date())
      setEventStatus('ok')
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

  // Floating, draggable, resizable debug popup component
  function DraggableDebugPopup({ onClose, lines, onAdvancePhase }: { onClose: () => void; lines: string[]; onAdvancePhase: () => void }) {
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
            onClick={onAdvancePhase}
            title="Send END_PHASE to the backend"
          >
            Advance Phase
          </button>
        </div>
        <div className="debug-popup-resize" onMouseDown={onResizeMouseDown} title="Drag to resize">⤡</div>
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
        <DraggableDebugPopup
          onClose={() => setDebugOpen(false)}
          lines={mockDebugLines}
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
          ) : (
            <>
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
            </>
          )}
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
          ) : null}
        </aside>
      </main>
    </div>
  )
}

export default App
