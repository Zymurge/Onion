import { bootstrapTestGame } from './test-game-helper.js'

try {
	const gameId = await bootstrapTestGame()
	console.log(gameId)
} catch (error) {
	const message = error instanceof Error ? error.message : String(error)
	console.error(message)
	process.exitCode = 1
}