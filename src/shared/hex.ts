import type { HexPos } from '../types/index.js'

export type { HexPos } from '../types/index.js'

export function hexKey({ q, r }: HexPos): string {
	return `${q},${r}`
}

function axialToCube({ q, r }: HexPos) {
	const x = q
	const z = r
	const y = -x - z

	return { x, y, z }
}

export function hexDistance(a: HexPos, b: HexPos): number {
	const left = axialToCube(a)
	const right = axialToCube(b)

	return Math.max(
		Math.abs(left.x - right.x),
		Math.abs(left.y - right.y),
		Math.abs(left.z - right.z),
	)
}

const AXIAL_DIRECTIONS: readonly HexPos[] = [
	{ q: 1, r: 0 },
	{ q: -1, r: 0 },
	{ q: 0, r: 1 },
	{ q: 0, r: -1 },
	{ q: 1, r: -1 },
	{ q: -1, r: 1 },
]

export function getNeighbors(pos: HexPos): HexPos[] {
	return AXIAL_DIRECTIONS.map((direction) => ({
		q: pos.q + direction.q,
		r: pos.r + direction.r,
	}))
}

export function hexesWithinRange(center: HexPos, maxDistance: number, minDistance = 1): HexPos[] {
	const normalizedMax = Math.floor(maxDistance)
	const normalizedMin = Math.max(0, Math.floor(minDistance))

	if (normalizedMax < normalizedMin || normalizedMax < 0) {
		return []
	}

	const hexes: HexPos[] = []

	for (let q = center.q - normalizedMax; q <= center.q + normalizedMax; q += 1) {
		for (let r = center.r - normalizedMax; r <= center.r + normalizedMax; r += 1) {
			const candidate = { q, r }
			const distance = hexDistance(center, candidate)

			if (distance < normalizedMin || distance > normalizedMax) {
				continue
			}

			hexes.push(candidate)
		}
	}

	hexes.sort((left, right) => {
		const distanceDelta = hexDistance(center, left) - hexDistance(center, right)

		if (distanceDelta !== 0) {
			return distanceDelta
		}

		if (left.q !== right.q) {
			return left.q - right.q
		}

		return left.r - right.r
	})

	return hexes
}