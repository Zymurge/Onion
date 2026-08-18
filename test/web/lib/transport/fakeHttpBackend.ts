export type FakeHttpResponse = {
	status?: number
	body?: unknown
	headers?: HeadersInit
}

export type FakeHttpRequest = {
	method: string
	path: string
	body?: string
	headers: HeadersInit
}

type FakeHttpOutcome =
	| { kind: 'response'; response: FakeHttpResponse }
	| { kind: 'network-error'; error: unknown }

function normalizeMethod(method: string | undefined): string {
	return (method ?? 'GET').toUpperCase()
}

function normalizePath(baseUrl: string, input: RequestInfo | URL): string {
	const url = input instanceof Request
		? new URL(input.url)
		: new URL(String(input))
	const basePath = new URL(baseUrl).pathname.replace(/\/$/, '')
	const requestPath = `${url.pathname}${url.search}`
	return requestPath.startsWith(basePath)
		? requestPath.slice(basePath.length) || '/'
		: requestPath
}

export function createFakeHttpBackend(options: { baseUrl: string }) {
	const outcomes = new Map<string, FakeHttpOutcome[]>()
	const requests: FakeHttpRequest[] = []

	function key(method: string, path: string): string {
		return `${normalizeMethod(method)} ${path}`
	}

	function queue(method: string, path: string, outcome: FakeHttpOutcome): void {
		const requestKey = key(method, path)
		const queued = outcomes.get(requestKey) ?? []
		queued.push(outcome)
		outcomes.set(requestKey, queued)
	}

	const fetchImpl: typeof fetch = async (input, init) => {
		const method = normalizeMethod(init?.method)
		const path = normalizePath(options.baseUrl, input)
		const request: FakeHttpRequest = {
			method,
			path,
			body: typeof init?.body === 'string' ? init.body : undefined,
			headers: init?.headers ?? {},
		}
		requests.push(request)

		const queued = outcomes.get(key(method, path))
		const outcome = queued?.shift()
		if (outcome === undefined) {
			throw new Error(`No fake HTTP response queued for ${method} ${path}`)
		}

		if (outcome.kind === 'network-error') {
			throw outcome.error
		}

		return new Response(
			outcome.response.body === undefined ? null : JSON.stringify(outcome.response.body),
			{
				status: outcome.response.status ?? 200,
				headers: {
					'content-type': 'application/json',
					...outcome.response.headers,
				},
			},
		)
	}

	return {
		fetchImpl,
		queueResponse(method: string, path: string, response: FakeHttpResponse): void {
			queue(method, path, { kind: 'response', response })
		},
		queueNetworkFailure(method: string, path: string, error: unknown): void {
			queue(method, path, { kind: 'network-error', error })
		},
		getRequests(): FakeHttpRequest[] {
			return requests.slice()
		},
		clear(): void {
			outcomes.clear()
			requests.length = 0
		},
	}
}
