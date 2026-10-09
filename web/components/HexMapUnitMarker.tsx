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
  combatMembers: ReadonlyArray<HexOccupant>
  isCombatPhase: boolean
  isMovementPhase: boolean
  isOccupantSelected: boolean
  isSelectionLocked: boolean
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
  activeCombatRole,
  center,
  combatMembers,
  isCombatPhase,
  isMovementPhase,
  isOccupantSelected,
  isSelectionLocked,
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
  const isOccupantOnion = occupant.unitId === onion.unitId
  const offset = getStackOffset(offsetIndex, renderedOccupantCount)
  const isSwamp = occupant.typeId === 'Swamp'
  const spriteHref = getUnitSpriteHref(getUnitDefinition(occupant.typeId)?.spriteKey, occupant.state)
  const isDestroyed = occupant.state === 'destroyed'
  const isPartialDestroyed = combatMembers.some((member) => member.state === 'destroyed')
    && combatMembers.some((member) => member.state !== 'destroyed')
  const hasDestroyedOnionSubsystem = isOccupantOnion && (
    occupant.weapons.some((weapon) => weapon.state === 'destroyed')
      || ('treads' in occupant && occupant.treads !== undefined && occupant.treads < 45)
  )
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
  const moveHasRemaining = isOccupantOnion
    ? onion.movesRemaining > 0
    : 'movesRemaining' in occupant && occupant.movesRemaining > 0
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
  const markerTextLines = markerText === null ? [] : wrapMarkerText(markerText)
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
        inspectable: occupant.state !== 'destroyed' || isSwamp,
        moveEligible: isMovementPhase && occupant.state === 'operational' && (
          isOccupantOnion ? onion.movesRemaining > 0 : 'movesRemaining' in occupant && occupant.movesRemaining > 0
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
          className={[
            'hex-unit-rect',
            isSwamp ? swampRectClass : 'hex-unit-rect-onion',
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
      ) : null}
      {markerText !== null ? (
        <text
          className={['hex-unit-marker', markerToneClass].join(' ')}
          x={center.x}
          y={center.y + 16}
          textAnchor="middle"
        >
          {markerTextLines.map((line, index) => (
            <tspan key={`${line}-${index}`} x={center.x} dy={index === 0 ? 0 : 10}>
              {line}
            </tspan>
          ))}
        </text>
      ) : null}
      {spriteHref !== undefined ? (
        <image
          href={spriteHref}
          x={center.x - 32.5}
          y={center.y - 35}
          width={65}
          height={65}
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