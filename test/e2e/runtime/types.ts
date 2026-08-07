/**
 * Contracts for the automated browser E2E runtime supervisor.
 *
 * These types are intentionally free of engine, shared, and web imports so the
 * harness lifecycle stays decoupled from gameplay architecture changes.
 */

export type RuntimeComponent = 'database' | 'engine' | 'web'

/**
 * Ownership of a runtime component relative to the current invocation.
 *
 * - `external`: supplied via a runtime parameter; never stopped or deleted by teardown.
 * - `reused`: discovered through a healthy descriptor; never stopped by the attaching run.
 * - `owned`: started by this invocation; eligible for success teardown.
 */
export type RuntimeOwnership = 'external' | 'reused' | 'owned'

export type ResolvedRuntimeOptions = {
	databaseUrl: string | undefined
	engineUrl: string | undefined
	webUrl: string | undefined
	runtimeFile: string
	reuseRuntime: boolean
	keepRuntimeOnFailure: boolean
	startupTimeoutMs: number
}

export const RUNTIME_DESCRIPTOR_VERSION = 1

/** On-disk record that lets a later invocation discover and reuse a running harness. */
export type RuntimeDescriptor = {
	version: typeof RUNTIME_DESCRIPTOR_VERSION
	pid: number
	startedAt: string
	engineUrl: string
	webUrl: string
	databaseUrl?: string
	databaseContainerId?: string
	logDir: string
	artifactFile: string
}

/** Test data created by a run, tracked so cleanup never deletes unrelated rows. */
export type E2EArtifacts = {
	gameIds: number[]
	userIds: string[]
}

export type StoppableResource = {
	ownership: RuntimeOwnership
	stop?: () => Promise<void>
}

export type ResolvedRuntime = {
	engineUrl: string
	webUrl: string
	databaseUrl: string | undefined
	logDir: string
	artifactFile: string
	ownership: Record<RuntimeComponent, RuntimeOwnership>
}

export interface HttpProbe {
	/** Resolves once the URL answers with the expected status, rejects on timeout. */
	waitForStatus(url: string, path: string, timeoutMs: number, expectedStatus?: number): Promise<void>
}

export interface DatabaseProbe {
	/** Resolves when the connection string accepts a trivial query. */
	check(databaseUrl: string): Promise<void>
}

export interface ProcessHandle {
	stop(): Promise<void>
}

export interface ProcessLauncher {
	spawn(input: {
		command: string
		args: string[]
		env: NodeJS.ProcessEnv
		logPath: string
	}): ProcessHandle
}

export interface DatabaseContainerHandle {
	connectionUri: string
	containerId: string
	stop(): Promise<void>
}

export interface DatabaseContainerLauncher {
	start(): Promise<DatabaseContainerHandle>
}

export interface DescriptorStore {
	read(path: string): Promise<RuntimeDescriptor | null>
	write(path: string, descriptor: RuntimeDescriptor): Promise<void>
	remove(path: string): Promise<void>
	/** Creates the lock exclusively; rejects when another invocation holds it. */
	acquireLock(path: string): Promise<{ release(): Promise<void> }>
}

export interface PortAllocator {
	allocate(): Promise<number>
}

export type RuntimeAdapters = {
	http: HttpProbe
	database: DatabaseProbe
	processes: ProcessLauncher
	databaseContainer: DatabaseContainerLauncher
	descriptors: DescriptorStore
	ports: PortAllocator
}
