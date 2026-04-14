import type { EventEnvelope } from '#shared/types/index'

export function renderEvents(events: EventEnvelope[]): string {
  if (events.length === 0) {
    return 'Events\n  (none)'
  }

  const lines = ['Events']
  for (const event of events) {
    switch (event.type) {
      case 'UNIT_MOVED':
        lines.push(`  #${event.seq} UNIT_MOVED unitId="${event.unitId}" to=${JSON.stringify(event.to)}`)
        break
      case 'ONION_MOVED':
        lines.push(`  #${event.seq} ONION_MOVED to=${JSON.stringify(event.to)}`)
        break
      case 'WEAPON_FIRED':
        lines.push(
          `  #${event.seq} WEAPON_FIRED: weapon=${event.weaponType} idx=${event.weaponIndex} target=${event.targetId} roll=${event.roll} outcome=${event.outcome} odds=${event.odds}`,
        )
        break
      case 'UNIT_STATUS_CHANGED':
        lines.push(
          `  #${event.seq} UNIT_STATUS_CHANGED: unit=${event.unitId} ${event.from} → ${event.to}`,
        )
        break
      case 'ONION_TREADS_LOST':
        lines.push(
          `  #${event.seq} ONION_TREADS_LOST: amount=${event.amount} remaining=${event.remaining}`,
        )
        break
      case 'ONION_BATTERY_DESTROYED':
        lines.push(
          `  #${event.seq} ONION_BATTERY_DESTROYED: weaponId=${event.weaponId} weaponType=${event.weaponType}`,
        )
        break
      default: {
        const details = Object.entries(event)
          .filter(([key]) => key !== 'seq' && key !== 'type' && key !== 'timestamp')
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
          .join(' ')
        lines.push(`  #${event.seq} ${event.type}${details ? ` ${details}` : ''}`)
      }
    }
  }

  return lines.join('\n')
}