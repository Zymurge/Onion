type GameAbortedScreenProps = {
  message?: string
}

export function GameAbortedScreen({ message }: GameAbortedScreenProps) {
  return (
    <div className="game-aborted" data-testid="game-aborted" role="alert">
      <h1>Game aborted</h1>
      <p>{message ?? 'This game was stopped because its state could not be verified.'}</p>
    </div>
  )
}