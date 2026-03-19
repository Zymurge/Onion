import type { EventEnvelope } from '../../types/index.js'

export function renderEvents(events: EventEnvelope[]): string {
  if (events.length === 0) {
    return 'Events\n  (none)'
  }

  const lines = ['Events']
  for (const event of events) {
    const details = Object.entries(event)
      .filter(([key]) => key !== 'seq' && key !== 'type' && key !== 'timestamp')
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ')

    lines.push(`  #${event.seq} ${event.type}${details ? ` ${details}` : ''}`)
  }

  return lines.join('\n')
}