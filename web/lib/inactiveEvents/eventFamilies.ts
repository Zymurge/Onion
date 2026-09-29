/** Event types that represent ordinary movement activity. */
export const MOVE_EVENT_TYPES = new Set(['ONION_MOVED', 'UNIT_MOVED'])

/** Event types that represent resolved movement or combat activity. */
export const RESOLVED_EVENT_TYPES = new Set(['FIRE_RESOLVED', 'MOVE_RESOLVED'])

/** Event types that attach as follow-up details to a preceding action. */
export const FOLLOW_UP_EVENT_TYPES = new Set(['ONION_TREADS_LOST', 'ONION_WEAPON_DESTROYED', 'UNIT_STATUS_CHANGED', 'UNIT_SQUADS_LOST'])
