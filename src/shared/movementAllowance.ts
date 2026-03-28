export function onionMovementAllowance(treads: number): number {
	if (treads <= 0) return 0
	if (treads <= 15) return 1
	if (treads <= 30) return 2
	return 3
}