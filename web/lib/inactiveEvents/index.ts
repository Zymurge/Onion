/** Polls and buffers inactive-player events for the opponent activity feed. */
export { useInactiveEventStream } from './useInactiveEventStream'

/** Contracts used by the inactive-event stream hook and timeline builders. */
export type { InactiveEventPayload, InactiveEventStream, UseInactiveEventStreamOptions } from './types'

/** Groups persisted event envelopes into display-ready inactive timeline entries. */
export { buildTimelineEvents } from './timeline'
