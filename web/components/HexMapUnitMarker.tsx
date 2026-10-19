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
import { getUnitDefinition } from '../../shared/unitDefinitions'
import { getUnitSpriteHref } from '../lib/unitSpriteRegistry'
import type { SessionCatalog } from '../lib/sessionCatalog'
import { DEFAULT_HEX_SIZE } from '../lib/hexPixelLayout'
import { resolveHexMapSpriteLayout } from '../lib/hexMapSpriteLayout'

const DEFENDER_LABEL_LIFT = DEFAULT_HEX_SIZE * 2 * 0.1

function wrapMarkerText(text: string, maximumLineLength = 12): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const candidate = currentLine === '' ? word : `${currentLine} ${word}`
    if (currentLine !== '' && candidate.length > maximumLineLength) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = candidate
    }
  }

  if (currentLine !== '') {
    lines.push(currentLine)
  }

  return lines
}

type HexMapUnitMarkerProps = {
  activeCombatRole: 'onion' | 'defender' | null
  center: { x: number; y: number }
  catalog?: SessionCatalog
  combatMembers: ReadonlyArray<HexOccupant>
  isCombatPhase: boolean
  isMovementPhase: boolean
  isOccupantSelected: boolean
  isSelectionLocked: boolean
  isInspectionOnly?: boolean
  isTurnHandoffLocked?: boolean
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

/** Renders one occupant marker and routes its selection interaction. */
export function HexMapUnitMarker({
  center,
  catalog,
  combatMembers,
  isCombatPhase,
  isMovementPhase,
  isOccupantSelected,
  isSelectionLocked,
  isInspectionOnly = false,
  isTurnHandoffLocked = false,
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
  const isOccupantOnion = occupant.role === 'onion'
  const occupantMovesRemaining = occupant.unitId === onion.unitId
    ? onion.movesRemaining
    : occupant.movesRemaining
  const offset = getStackOffset(offsetIndex, renderedOccupantCount)
  const isSwamp = occupant.typeId === 'Swamp'
  const isDestroyed = occupant.state === 'destroyed'
  const isPartialDestroyed = combatMembers.some((member) => member.state === 'destroyed')
    && combatMembers.some((member) => member.state !== 'destroyed')
  const hasDestroyedMembers = isDestroyed || isPartialDestroyed
  const hasDestroyedOnionSubsystem = isOccupantOnion && (
    occupant.weapons.some((weapon) => weapon.state === 'destroyed')
      || ('treads' in occupant && occupant.treads !== undefined && occupant.treads < 45)
  )
  const unitDefinition = catalog?.unitTypes[occupant.typeId] ?? getUnitDefinition(occupant.typeId)
  const spriteHref = getUnitSpriteHref(
    unitDefinition?.spriteKey,
    occupant.state,
    hasDestroyedOnionSubsystem,
  )
  const spriteLayout = resolveHexMapSpriteLayout(unitDefinition, center, DEFAULT_HEX_SIZE)
  const showOnionDamageTone = hasDestroyedOnionSubsystem
    && (phase === 'DEFENDER_COMBAT' || phase === 'GEV_SECOND_MOVE' || (phase === 'ONION_MOVE' && isTurnHandoffLocked))
  const isDisabled = occupant.state === 'disabled'
  const isMovementPhaseActiveSide = phase === 'ONION_MOVE'
    ? isOccupantOnion
    : phase === 'DEFENDER_MOVE' || phase === 'GEV_SECOND_MOVE'
      ? !isOccupantOnion
      : false
  const combatHasReadyAttack = getGroupCombatReadyCount(combatMembers) > 0
  const combatIsDisabled = isGroupCombatDisabled(combatMembers)
  const moveHasRemaining = occupantMovesRemaining > 0
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
  const markerTextLines = markerText === null ? [] : wrapMarkerText(markerText)
  function handleClick(event: MouseEvent<SVGGElement>) {
    if (isSelectionLocked && !isInspectionOnly) {
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
        inspectable: true,
        moveEligible: isMovementPhase && occupant.state === 'operational' && occupantMovesRemaining > 0,
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

    onSelectUnit(occupant.unitId, event.ctrlKey || event.metaKey || decision.intent === 'toggle-actor')
  }

  return (
    <g
      data-testid={`hex-unit-${occupant.unitId}`}
      data-selected={isOccupantSelected}
      className={[
        'hex-unit-stack',
        isOccupantOnion ? 'hex-unit-stack-onion' : 'hex-unit-stack-defender',
        isSwamp ? 'hex-unit-stack-swamp' : '',
        isOccupantSelected ? 'hex-unit-stack-selected' : '',
        isMovementPhase && movementEligibilityClass === 'hex-unit-rect-move-eligible' ? 'hex-unit-stack-move-ready' : '',
        isDisabled ? 'hex-unit-stack-disabled' : '',
        isSwamp
          ? (isDestroyed ? 'tone-destroyed' : 'tone-neutral')
          : isPartialDestroyed || (!isDestroyed && showOnionDamageTone)
            ? 'tone-destroyed-partial'
            : isDestroyed
              ? 'tone-destroyed'
              : `tone-${statusTone(occupant.state)}`,
      ].join(' ')}
      transform={`translate(${offset.dx}, ${offset.dy})`}
      onClick={handleClick}
    >
      {isSwamp || isOccupantOnion ? (
        <rect
          className={isSwamp ? ['hex-unit-rect', swampRectClass].join(' ') : 'hex-unit-onion-hit-target'}
          fill="transparent"
          stroke="none"
          x={unitRectX}
          y={unitRectY}
          width={unitRectWidth}
          height={unitRectHeight}
          rx={isSwamp ? 4 : 2}
          pointerEvents="all"
        />
      ) : null}
      {spriteHref !== undefined ? (
        <image
          href={spriteHref}
          x={spriteLayout.x}
          y={spriteLayout.y}
          width={spriteLayout.width}
          height={spriteLayout.height}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : null}
      {hasDestroyedMembers ? (
        <g
          className="hex-unit-destroyed-indicator"
          data-testid={`hex-unit-destroyed-indicator-${occupant.unitId}`}
          role="img"
          aria-label={isDestroyed ? 'Destroyed' : 'Destroyed unit in stack'}
          pointerEvents="none"
        >
          <circle
            cx={center.x + 17}
            cy={center.y - 16}
            r={8.5}
            fill={isDestroyed ? '#b71c1c' : '#c76b2f'}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
          <path
            d={`M ${center.x + 13.5} ${center.y - 19.5} L ${center.x + 20.5} ${center.y - 12.5} M ${center.x + 20.5} ${center.y - 19.5} L ${center.x + 13.5} ${center.y - 12.5}`}
            fill="none"
            stroke="#ffffff"
            strokeLinecap="round"
            strokeWidth={2}
          />
        </g>
      ) : null}
      {markerText !== null ? (
        <text
          className="hex-unit-marker"
          fill={isOccupantOnion ? '#ffffff' : '#111111'}
          x={center.x}
          y={center.y + (isOccupantOnion ? 16 : 24 - DEFENDER_LABEL_LIFT)}
          textAnchor="middle"
        >
          {markerTextLines.map((line, index) => (
            <tspan key={`${line}-${index}`} x={center.x} dy={index === 0 ? 0 : isOccupantOnion ? 10 : 8}>
              {line}
            </tspan>
          ))}
        </text>
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