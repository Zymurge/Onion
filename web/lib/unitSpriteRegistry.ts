import pussSprite from '../assets/unit-sprites/puss-sprite.png'
import bigBadWolfSprite from '../assets/unit-sprites/big-bad-wolf-sprite.png'
import farquaadSprite from '../assets/unit-sprites/farquaad-sprite.png'
import littlePigsSprite from '../assets/unit-sprites/little-pigs-sprite.png'
import onionSprite from '../assets/unit-sprites/the-onion-sprite.png'
import pinocchioSprite from '../assets/unit-sprites/pinocchio-sprite.png'
import witchSprite from '../assets/unit-sprites/witch-sprite.png'
import swampDestroyedSprite from '../assets/unit-sprites/The Swamp - destroyed.png'
import swampIntactSprite from '../assets/unit-sprites/The Swamp - intact.png'

export type UnitSprite = string | { operational: string; destroyed: string }

export const unitSpriteRegistry: Readonly<Record<string, UnitSprite>> = {
	'puss': pussSprite,
	'big-bad-wolf': bigBadWolfSprite,
	'witch': witchSprite,
	'farquaad': farquaadSprite,
	'pinocchio': pinocchioSprite,
	'dragon': pussSprite,
	'little-pigs': littlePigsSprite,
	'the-onion': onionSprite,
	'swamp': { operational: swampIntactSprite, destroyed: swampDestroyedSprite },
}

export function getUnitSpriteHref(spriteKey: string | undefined, state: 'operational' | 'disabled' | 'recovering' | 'destroyed'): string | undefined {
	if (spriteKey === undefined) {
		return undefined
	}

	const sprite = unitSpriteRegistry[spriteKey]
	if (sprite === undefined) {
		return undefined
	}

	return typeof sprite === 'string' ? sprite : state === 'destroyed' ? sprite.destroyed : sprite.operational
}