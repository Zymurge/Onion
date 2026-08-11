import type { MouseEvent } from 'react'
import { getGroupCombatReadyCount, isGroupCombatDisabled } from '../lib/stackReadiness'
import {
  getStackOffset,
  getUnitMarkerText,
  type HexOccupant,
  type OccupantRosterGroup,
} from '../lib/hexMapOccupancy'
import { statusTone, type BattlefieldOnionView } from '../lib/battlefieldView'
import type { StackNamingSnapshot } from '../../shared/stackNaming'
import type {
  InteractionPhaseMode,
  InteractionRoutingDecision,
  InteractionRoutingRequest,
  InteractionViewerActivity,
  InteractionViewerRole,
} from '../lib/interactionRouting'
import swampDestroyedSprite from '../assets/The Swamp - destroyed.png'
import swampIntactSprite from '../assets/The Swamp - intact.png'

type HexMapUnitMarkerProps = {
  activeCombatRole: 'onion' | 'defender' | null
  center: { x: number; y: number }
  combatMembers: ReadonlyArray<HexOccupant>
  isCombatPhase: boolean
  isMovementPhase: boolean
  isOccupantSelected: boolean
  isSelectionLocked: boolean
  occupant: HexOccupant
  offsetIndex: number
  renderedOccupantCount: number
  onion: BattlefieldOnionView
  phase: string | null
  resolvedPhaseMode: InteractionPhaseMode
  resolvedViewerActivity: InteractionViewerActivity
  resolvedViewerRole: InteractionViewerRole
  routeMapInteraction: (request: InteractionRoutingRequest) => InteractionRoutingDecision
  rosterGroup: OccupantRosterGroup | null
  stackNaming?: StackNamingSnapshot
  onDeselect: () => void
  onSelectUnit: (unitId: string, additive?: boolean) => void
}

function getSwampSpriteHref(status: string) {
  return status === 'destroyed' ? swampDestroyedSprite : swampIntactSprite
}

/** Renders one occupant marker and routes its selection interaction. */
export function HexMapUnitMarker({
  activeCombatRole,
  center,
  combatMembers,
  isCombatPhase,
  isMovementPhase,
  isOccupantSelected,
  isSelectionLocked,
  occupant,
  offsetIndex,
  renderedOccupantCount,
  onion,
  phase,
  resolvedPhaseMode,
  resolvedViewerActivity,
  resolvedViewerRole,
  routeMapInteraction,
  rosterGroup,
  stackNaming,
  onDeselect,
  onSelectUnit,
}: HexMapUnitMarkerProps) {
  const isOccupantOnion = occupant.id === onion.id
  const offset = getStackOffset(offsetIndex, renderedOccupantCount)
  const isSwamp = occupant.type === 'Swamp'
  const isDestroyed = occupant.status === 'destroyed'
  const isDisabled = occupant.status === 'disabled'
  const isMovementPhaseActiveSide = phase === 'ONION_MOVE'
    ? isOccupantOnion
    : phase === 'DEFENDER_MOVE' || phase === 'GEV_SECOND_MOVE'
      ? !isOccupantOnion
      : false
  const combatHasReadyAttack = getGroupCombatReadyCount(combatMembers) > 0
  const combatIsDisabled = isGroupCombatDisabled(combatMembers)
  const moveHasRemaining = isOccupantOnion
    ? onion.movesRemaining > 0
    : 'move' in occupant && occupant.move > 0
  const combatEligibilityClass = !isCombatPhase
    ? ''
    : isDestroyed || isDisabled
      ? 'hex-unit-rect-combat-disabled'
      : activeCombatRole === 'onion'
        ? isOccupantOnion
          ? combatHasReadyAttack
            ? 'hex-unit-rect-combat-eligible'
            : 'hex-unit-rect-combat-ineligible'
          : 'hex-unit-rect-combat-inspectable'
        : activeCombatRole === 'defender'
          ? !isOccupantOnion
            ? combatHasReadyAttack
              ? 'hex-unit-rect-combat-eligible'
              : 'hex-unit-rect-combat-ineligible'
            : 'hex-unit-rect-combat-inspectable'
          : ''
  const movementEligibilityClass = !isMovementPhase
    ? ''
    : isSwamp
      ? isDestroyed ? 'hex-unit-rect-swamp-destroyed' : 'hex-unit-rect-swamp'
      : combatIsDisabled
        ? 'hex-unit-rect-move-disabled'
        : isMovementPhaseActiveSide
          ? moveHasRemaining
            ? 'hex-unit-rect-move-eligible'
            : 'hex-unit-rect-move-ineligible'
          : 'hex-unit-rect-move-inspectable'
  const swampRectClass = isSwamp
    ? isDestroyed || isDisabled
      ? 'hex-unit-rect-swamp-destroyed'
      : 'hex-unit-rect-swamp'
    : ''
  const unitRectX = isSwamp ? center.x - 24 : center.x - 16
  const unitRectY = isSwamp ? center.y - 24 : center.y - 11
  const unitRectWidth = isSwamp ? 48 : 32
  const unitRectHeight = isSwamp ? 48 : 22
  const markerText = getUnitMarkerText(occupant, stackNaming)
  const markerToneClass = !isSwamp && (
    movementEligibilityClass === 'hex-unit-rect-move-inspectable'
      || combatEligibilityClass === 'hex-unit-rect-combat-inspectable'
  )
    ? 'tone-dim'
    : ''

  function handleClick(event: MouseEvent<SVGGElement>) {
    if (isSelectionLocked) {
      event.stopPropagation()
      return
    }

    event.stopPropagation()
    const decision = routeMapInteraction({
      viewerRole: resolvedViewerRole,
      viewerActivity: resolvedViewerActivity,
      phaseMode: resolvedPhaseMode,
      surface: 'map',
      gesture: event.ctrlKey || event.metaKey ? 'primary-additive' : 'primary',
      subjectRelation: isSwamp
        ? 'neutral/system'
        : isOccupantOnion
          ? resolvedViewerRole === 'onion' ? 'self' : 'opponent'
          : resolvedViewerRole === 'defender' ? 'self' : 'opponent',
      subjectKind: rosterGroup !== null ? 'stack' : 'unit',
      subjectCapability: {
        inspectable: occupant.status !== 'destroyed' || isSwamp,
        moveEligible: isMovementPhase && occupant.status === 'operational' && (
          isOccupantOnion ? onion.movesRemaining > 0 : 'move' in occupant && occupant.move > 0
        ),
        attackerEligible: isCombatPhase && !combatIsDisabled && (
          isOccupantOnion
            ? resolvedViewerRole === 'onion' && combatHasReadyAttack
            : resolvedViewerRole === 'defender' && combatHasReadyAttack
        ),
        targetEligible: false,
      },
      interactionMode: rosterGroup !== null ? { groupExpansionTarget: true } : undefined,
    })

    if (decision.intent === 'clear-local-selection') {
      onDeselect()
      return
    }

    if (decision.intent === 'noop') {
      return
    }

    onSelectUnit(occupant.id, event.ctrlKey || event.metaKey || decision.intent === 'toggle-actor')
  }

  return (
    <g
      data-testid={`hex-unit-${occupant.id}`}
      data-selected={isOccupantSelected}
      className={[
        'hex-unit-stack',
        isOccupantOnion ? 'hex-unit-stack-onion' : 'hex-unit-stack-defender',
        isSwamp ? 'hex-unit-stack-swamp' : '',
        isOccupantSelected ? 'hex-unit-stack-selected' : '',
        isMovementPhase && movementEligibilityClass === 'hex-unit-rect-move-eligible' ? 'hex-unit-stack-move-ready' : '',
        isDisabled ? 'hex-unit-stack-disabled' : '',
        isSwamp ? (isDestroyed ? 'tone-destroyed' : 'tone-neutral') : `tone-${statusTone(occupant.status)}`,
      ].join(' ')}
      transform={`translate(${offset.dx}, ${offset.dy})`}
      onClick={handleClick}
    >
      <rect
        className={[
          'hex-unit-rect',
          isSwamp ? swampRectClass : isOccupantOnion ? 'hex-unit-rect-onion' : 'hex-unit-rect-defender',
          isOccupantSelected ? 'hex-unit-rect-selected' : '',
          isSwamp ? '' : movementEligibilityClass,
          isDisabled ? 'hex-unit-rect-disabled' : '',
          isSwamp ? '' : combatEligibilityClass,
        ].join(' ')}
        x={unitRectX}
        y={unitRectY}
        width={unitRectWidth}
        height={unitRectHeight}
        rx={isSwamp ? 4 : 2}
      />
      {markerText !== null ? (
        <text
          className={['hex-unit-marker', markerToneClass].join(' ')}
          x={center.x}
          y={center.y + 4}
          textAnchor="middle"
        >
          {markerText}
        </text>
      ) : null}
      {isSwamp ? (
        <image
          href={getSwampSpriteHref(occupant.status)}
          x={center.x - 19}
          y={center.y - 19}
          width={38}
          height={38}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : null}
      {isDisabled ? (
        <g className="hex-unit-disabled-indicator">
          <rect
            x={center.x - 16}
            y={center.y - 11}
            width={32}
            height={22}
            rx={2}
            fill="#888"
            opacity="0.18"
          />
          <text
            x={center.x + 12}
            y={center.y - 7}
            fontSize="13"
            fill="#b71c1c"
            fontWeight="bold"
            textAnchor="middle"
            className="hex-unit-disabled-icon"
          >
            &#9888;
          </text>
        </g>
      ) : null}
    </g>
  )
}