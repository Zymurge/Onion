import type { DatabaseProbe, DescriptorStore, HttpProbe, RuntimeDescriptor } from './types.js'

type DiscoveryAdapters = {
	http: HttpProbe
	database: DatabaseProbe
	descriptors: DescriptorStore
}

/**
 * Attempts to discover and validate a healthy reusable runtime.
 *
 * Returns the descriptor if all services are healthy, otherwise removes
 * the stale descriptor and returns null.
 */
export async function discoverHealthyRuntime(
	descriptorPath: string,
	timeoutMs: number,
	adapters: DiscoveryAdapters,
): Promise<RuntimeDescriptor | null> {
	const descriptor = await adapters.descriptors.read(descriptorPath)
	if (!descriptor) {
		return null
	}

	try {
		await Promise.all([
			adapters.http.waitForStatus(descriptor.engineUrl, '/health/ready', Math.min(timeoutMs, 5_000)),
			adapters.http.waitForStatus(descriptor.webUrl, '/', Math.min(timeoutMs, 5_000)),
			descriptor.databaseUrl ? adapters.database.check(descriptor.databaseUrl) : Promise.resolve(),
		])
		return descriptor
	} catch {
		await adapters.descriptors.remove(descriptorPath)
		return null
	}
}
