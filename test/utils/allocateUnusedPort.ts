import { createServer } from 'node:net'

export async function allocateUnusedPort(): Promise<number> {
	const server = createServer()
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject)
		server.listen(0, '127.0.0.1', resolve)
	})

	const address = server.address()
	if (address === null || typeof address === 'string') {
		throw new Error('Unable to determine the allocated TCP port.')
	}

	await new Promise<void>((resolve, reject) => {
		server.close((error) => error ? reject(error) : resolve())
	})
	return address.port
}
