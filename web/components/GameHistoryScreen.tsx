import { useEffect, useMemo, useState } from 'react'
import { clearAuthSession, getAuthSession } from '../lib/authSession'
import { requestJson } from '../../shared/apiProtocol'
import { useLobbyPolling } from '../lib/useLobbyPolling'
import { ErrorOverlay } from './ErrorOverlay'
import { ConfirmationSurface } from './ConfirmationSurface'
import { UserSideMenu } from './UserSideMenu'
import './UserDashboard.css'
import './GameHistoryScreen.css'

type HistoryStatus = 'all' | 'completed' | 'archived'
type HistoryCreator = 'any' | 'me'

type HistoryGame = {
  gameId: number
  scenarioId: string
  scenarioDisplayName: string
  phase: string
  turnNumber: number
  winner: string | null
  status: 'completed' | 'archived'
  createdAt: string | null
  lastActivityAt: string | null
  completedAt: string | null
  hostUserId: string
  canDelete: boolean
  players: { onion: string | null; defender: string | null }
  role: 'onion' | 'defender'
}

type GameHistoryScreenProps = {
  navigate?: (path: string) => void
}

type Confirmation = {
  action: 'archive' | 'restore' | 'delete'
  game: HistoryGame
}

function readFilter<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = new URLSearchParams(window.location.search).get(name)
  return value !== null && allowed.includes(value as T) ? value as T : fallback
}

function formatDate(value: string | null): string {
  if (value === null) return 'No activity recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function winnerLabel(game: HistoryGame, userId: string | undefined): string {
  if (game.winner === null) return 'No winner recorded'
  return game.winner === userId ? 'You won' : 'Opponent won'
}

function matchesSearch(game: HistoryGame, search: string, userId: string | undefined): boolean {
  const needle = search.trim().toLowerCase()
  if (needle.length === 0) return true
  return [
    String(game.gameId),
    game.scenarioId,
    game.scenarioDisplayName,
    game.hostUserId,
    game.players.onion ?? '',
    game.players.defender ?? '',
    game.role,
    userId ?? '',
  ].some((value) => value.toLowerCase().includes(needle))
}

export function GameHistoryScreen({ navigate }: GameHistoryScreenProps) {
  const session = getAuthSession()
  const [status, setStatus] = useState<HistoryStatus>(() => readFilter('status', ['all', 'completed', 'archived'], 'all'))
  const [creator, setCreator] = useState<HistoryCreator>(() => readFilter('creator', ['any', 'me'], 'any'))
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const [activitySince, setActivitySince] = useState(() => new URLSearchParams(window.location.search).get('lastActivityAfter') ?? '')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const apiBaseUrl = session?.apiBaseUrl
  const token = session?.token
  const historyPath = useMemo(() => {
    const params = new URLSearchParams({ status, creator })
    if (activitySince !== '') params.set('lastActivityAfter', new Date(activitySince).toISOString())
    return `games/history?${params.toString()}`
  }, [activitySince, creator, status])
  const historyReturnTo = useMemo(() => {
    const params = new URLSearchParams()
    if (status !== 'all') params.set('status', status)
    if (creator !== 'any') params.set('creator', creator)
    if (search.trim() !== '') params.set('q', search.trim())
    if (activitySince !== '') params.set('lastActivityAfter', new Date(activitySince).toISOString())
    const query = params.toString()
    return query.length === 0 ? '/user/history' : `/user/history?${query}`
  }, [activitySince, creator, search, status])
  const { games, loading, error, refresh, setError } = useLobbyPolling<HistoryGame>({
    apiBaseUrl,
    token,
    path: historyPath,
    errorMessage: 'Unable to load game history.',
  })
  const visibleGames = games.filter((game) => matchesSearch(game, search, session?.userId))

  useEffect(() => {
    const params = new URLSearchParams()
    if (status !== 'all') params.set('status', status)
    if (creator !== 'any') params.set('creator', creator)
    if (search.trim() !== '') params.set('q', search.trim())
    if (activitySince !== '') params.set('lastActivityAfter', new Date(activitySince).toISOString())
    const query = params.toString()
    window.history.replaceState({}, '', query.length === 0 ? '/user/history' : `/user/history?${query}`)
  }, [activitySince, creator, search, status])

  async function performAction(action: Confirmation['action'], game: HistoryGame) {
    if (!session) return
    const key = `${action}:${game.gameId}`
    setActionKey(key)
    setActionError(null)
    try {
      const result = await requestJson<{ gameId: number; status?: string; deleted?: boolean }>({
        baseUrl: session.apiBaseUrl,
        path: action === 'delete' ? `games/${game.gameId}` : `games/${game.gameId}/${action}`,
        method: action === 'delete' ? 'DELETE' : 'PATCH',
        token: session.token,
      })
      if (!result.ok) {
        setActionError(result.message)
        return
      }
      setConfirmation(null)
      await refresh()
    } catch {
      setActionError(`Unable to ${action} this game.`)
    } finally {
      setActionKey(null)
    }
  }

  function handleSignOut() {
    clearAuthSession()
    ;(navigate ?? ((path: string) => window.location.assign(path)))('/user/login')
  }

  return (
    <div className="shell dashboard-shell">
      {error || actionError ? <ErrorOverlay message={error ?? actionError ?? ''} className="error-overlay-connect" onDismiss={() => { setError(null); setActionError(null) }} /> : null}
      <div className="user-page-layout dashboard-layout">
        <UserSideMenu activeItem="history" onSignOut={handleSignOut} />
        <main className="dashboard-main">
          <header className="dashboard-header">
            <div>
              <p className="eyebrow">Archive desk</p>
              <h1>Game History</h1>
              <p className="dashboard-intro">Review completed matches and keep old records organized.</p>
            </div>
          </header>

          <section className="panel dashboard-games-panel history-panel">
            <div className="card-head">
              <div>
                <p className="eyebrow">Match archive</p>
                <h2>Completed Matches</h2>
              </div>
              <span className="dashboard-count">{visibleGames.length} matches</span>
            </div>
            <div className="history-filters" aria-label="History filters">
              <label>
                Status
                <select value={status} onChange={(event) => setStatus(event.target.value as HistoryStatus)}>
                  <option value="all">All history</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label>
                Creator
                <select aria-label="Creator" value={creator} onChange={(event) => setCreator(event.target.value as HistoryCreator)}>
                  <option value="any">Any participant</option>
                  <option value="me">Created by me</option>
                </select>
              </label>
              <label className="history-search-field">
                Search
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Game, scenario, or player" />
              </label>
              <label>
                Active since
                <input type="datetime-local" value={activitySince} onChange={(event) => setActivitySince(event.target.value)} />
              </label>
            </div>

            <div className="dashboard-game-list">
              {loading ? <p className="dashboard-empty-state">Loading match history...</p> : null}
              {!loading && visibleGames.length === 0 ? <p className="dashboard-empty-state">No matches match these filters.</p> : null}
              {!loading && visibleGames.map((game) => (
                <article className="dashboard-game-row history-game-row" key={game.gameId}>
                  <div>
                    <p className="dashboard-game-kicker">Game {game.gameId} · {game.status === 'archived' ? 'Archived' : winnerLabel(game, session?.userId)}</p>
                    <h3>{game.scenarioDisplayName}</h3>
                    <p>{winnerLabel(game, session?.userId)} · Turn {game.turnNumber} · {game.role === 'onion' ? 'The Onion' : 'Defenders'}</p>
                    <p>Onion: {game.players.onion ?? 'Open'} · Defenders: {game.players.defender ?? 'Open'}</p>
                    <p className="history-game-meta">Last game activity {formatDate(game.lastActivityAt)} · Completed {formatDate(game.completedAt)}</p>
                  </div>
                  <div className="history-game-actions">
                    <a className="dashboard-game-link" href={`/game/${game.gameId}?${new URLSearchParams({ returnTo: historyReturnTo }).toString()}`}>Review Game</a>
                    {game.canDelete ? (
                      <>
                        {game.status === 'completed' ? <button type="button" className="dashboard-game-link history-action-button" onClick={() => setConfirmation({ action: 'archive', game })}>Archive game</button> : <button type="button" className="dashboard-game-link history-action-button" onClick={() => setConfirmation({ action: 'restore', game })}>Restore game</button>}
                        <button type="button" className="dashboard-game-link history-action-button history-delete-action" onClick={() => setConfirmation({ action: 'delete', game })}>Delete game</button>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
      {confirmation ? (
        <div className="history-confirmation-backdrop" role="presentation">
          <ConfirmationSurface
            dataTestId="history-confirmation"
            eyebrow="Confirm maintenance"
            title={`${confirmation.action === 'delete' ? 'Delete' : confirmation.action === 'archive' ? 'Archive' : 'Restore'} game ${confirmation.game.gameId}`}
            badge={confirmation.game.status}
            summary={<p>{confirmation.action === 'delete' ? 'The snapshot and event history will be removed permanently.' : confirmation.action === 'archive' ? 'This completed game will leave current views but remain available in history.' : 'This game will return to completed history.'}</p>}
            actions={(
              <>
                <button type="button" className="history-cancel-button" onClick={() => setConfirmation(null)}>Cancel</button>
                <button type="button" className={confirmation.action === 'delete' ? 'history-confirm-delete' : 'history-confirm-button'} onClick={() => void performAction(confirmation.action, confirmation.game)} disabled={actionKey !== null}>
                  {actionKey === `${confirmation.action}:${confirmation.game.gameId}` ? 'Working...' : `Confirm ${confirmation.action}`}
                </button>
              </>
            )}
          >
            <p>{confirmation.game.scenarioDisplayName} · Current status: {confirmation.game.status}</p>
          </ConfirmationSurface>
        </div>
      ) : null}
    </div>
  )
}
