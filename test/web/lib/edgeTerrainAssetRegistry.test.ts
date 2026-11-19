import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  edgeTerrainAssetRegistry,
  edgeTerrainCornerAssetRegistry,
  edgeTerrainJunctionAssetRegistry,
  edgeTerrainRidgeTerminalAsset,
  edgeTerrainStreamTerminalAsset,
} from '../../../web/lib/edgeTerrainAssetRegistry'
import { EDGE_TERRAIN_VARIANTS } from '../../../shared/config/edgeTerrainVariants'

const segmentPaths = [
  'M0 8 H4 C14.67 8 14.67 6.6 25.33 6.6 C36 6.6 36 8.6 46.67 8.6 C57.33 8.6 57.33 8 68 8 H72',
  'M0 8 H4 C14.67 8 14.67 9.4 25.33 9.4 C36 9.4 36 7.4 46.67 7.4 C57.33 7.4 57.33 8 68 8 H72',
  'M0 8 C10.67 8 10.67 6.6 21.33 6.6 C32 6.6 32 8.6 42.67 8.6 C53.33 8.6 53.33 8 64 8 H72',
  'M0 8 C10.67 8 10.67 9.4 21.33 9.4 C32 9.4 32 7.4 42.67 7.4 C53.33 7.4 53.33 8 64 8 H72',
]
const streamAssets = ['stream-1.svg', 'stream-2.svg', 'stream-3.svg', 'stream-4.svg', 'stream-corner.svg']
const ridgeAssets = ['ridge-1.svg', 'ridge-2.svg', 'ridge-3.svg', 'ridge-4.svg', 'ridge-corner.svg']

function streamHighlightPattern(svg: string): string | undefined {
  return svg.match(/<pattern\b[^>]*id="stream-highlight"[\s\S]*?<\/pattern>/)?.[0]
}

function ridgeTexturePattern(svg: string): string | undefined {
  return svg.match(/<pattern\b[^>]*id="ridge-texture"[\s\S]*?<\/pattern>/)?.[0]
}

function drawableSvg(svg: string): string {
  const definitionsEnd = svg.indexOf('</defs>')
  return definitionsEnd < 0 ? svg : svg.slice(definitionsEnd + '</defs>'.length)
}

describe('edge terrain asset registry', () => {
  it('provides one segment asset for every supported variant', () => {
    for (const [type, variants] of Object.entries(EDGE_TERRAIN_VARIANTS)) {
      for (const variant of variants) {
        expect(edgeTerrainAssetRegistry[variant]).toMatch(
          new RegExp(`/terrain/edges/${type}-[1-4]\\.svg$`),
        )
      }
    }
  })

  it('provides one normalized corner asset for each terrain kind', () => {
    expect(edgeTerrainCornerAssetRegistry.ridge).toBe('/terrain/edges/ridge-corner.svg')
    expect(edgeTerrainCornerAssetRegistry.stream).toBe('/terrain/edges/stream-corner.svg')
  })

  it('provides one normalized junction asset for each terrain kind', () => {
    expect(edgeTerrainJunctionAssetRegistry.ridge).toBe('/terrain/edges/ridge-junction.svg')
    expect(edgeTerrainJunctionAssetRegistry.stream).toBe('/terrain/edges/stream-junction.svg')

    for (const asset of ['ridge-junction.svg', 'stream-junction.svg']) {
      const svg = readFileSync(new URL(`../../../web/public/terrain/edges/${asset}`, import.meta.url), 'utf8')
      expect(svg).toContain('viewBox="0 0 40 40"')
      expect(svg).toContain('M20 20 L13.217 16.085 M20 20 L26.783 16.085 M20 20 L20 27.83')
      expect(svg).not.toContain('patternTransform="rotate(90)')
    }

    const streamSvg = readFileSync(new URL('../../../web/public/terrain/edges/stream-junction.svg', import.meta.url), 'utf8')
    expect(streamSvg).toContain('stroke="#3e6d6f"')
    expect(streamSvg).toContain('id="stream-junction-highlight"')
    expect(streamSvg).toContain('transform="rotate(-120 20 20)"')
    expect(streamSvg).toContain('transform="rotate(120 20 20)"')
    expect(streamSvg).toContain('transform="rotate(-30 20 20)"')
    expect(streamSvg).toContain('stroke-width="0.4"')
    expect(streamSvg).toContain('M22.4 18.7 C23.3 18.45 24.2 18.95 25.1 18.7')
    expect(streamSvg).toContain('M22.4 20 C23.3 19.75 24.2 20.25 25.1 20')
    expect(streamSvg).toContain('M22.4 21.3 C23.3 21.05 24.2 21.55 25.1 21.3')
    expect(streamSvg).toContain('stroke-linecap="round"')

    const ridgeSvg = readFileSync(new URL('../../../web/public/terrain/edges/ridge-junction.svg', import.meta.url), 'utf8')
    expect(ridgeSvg).toContain('stroke="#715d48"')
    expect(ridgeSvg).toContain('id="ridge-junction-highlight"')
    expect(ridgeSvg).toContain('transform="rotate(-120 20 20)"')
    expect(ridgeSvg).toContain('transform="rotate(120 20 20)"')
    expect(ridgeSvg).toContain('stroke-width="0.35"')
    expect(ridgeSvg).toContain('M22.55 19.2 L22.85 20.8')
    expect(ridgeSvg).toContain('M24.05 19.2 L24.35 20.8')
    expect(ridgeSvg).toContain('M25.55 19.2 L25.85 20.8')
  })

  it('provides the dedicated stream terminal overlay asset', () => {
    expect(edgeTerrainStreamTerminalAsset).toBe('/terrain/edges/stream-terminal.svg')
    const svg = readFileSync(new URL('../../../web/public/terrain/edges/stream-terminal.svg', import.meta.url), 'utf8')
    const paths = Array.from(svg.matchAll(/<path d="([^"]+)" fill="([^"]+)"\/>/g))

    expect(svg).toContain('viewBox="0 0 4.5 9"')
    expect(paths.map((path) => path[1])).toEqual([
      'M4.5 0 C3 0.6 1.5 1.8 0 3.5 L0 5.5 C1.5 7.2 3 8.4 4.5 9 Z',
      'M4.5 1.8 C3 2.4 1.5 3.6 0 4.1 L0 4.9 C1.5 5.4 3 6.6 4.5 7.2 Z',
    ])
    expect(paths.map((path) => path[2])).toEqual(['#604b35', '#285d5f'])
  })

  it('provides a matching tapered ridge terminal overlay asset', () => {
    expect(edgeTerrainRidgeTerminalAsset).toBe('/terrain/edges/ridge-terminal.svg')
    const svg = readFileSync(new URL('../../../web/public/terrain/edges/ridge-terminal.svg', import.meta.url), 'utf8')
    const paths = Array.from(svg.matchAll(/<path d="([^"]+)" fill="([^"]+)"\/>/g))

    expect(svg).toContain('viewBox="0 0 4.5 9"')
    expect(paths.map((path) => path[2])).toEqual(['#604b35', '#bf9569'])
    expect(svg).toContain('<line x1="1.1" y1="0" x2="1.4" y2="9"/>')
    expect(svg).toContain('<line x1="3.3" y1="0" x2="3" y2="9"/>')
  })

  it.each(Object.keys(EDGE_TERRAIN_VARIANTS).flatMap((terrain) =>
    EDGE_TERRAIN_VARIANTS[terrain as keyof typeof EDGE_TERRAIN_VARIANTS].map((variant) => ({
      terrain,
      variant,
      index: Number(variant.slice(-1)) - 1,
    })),
  ))('matches segment geometry and stripe proportions for $variant', ({ terrain, variant, index }) => {
    const isStream = terrain === 'stream'
    const svg = readFileSync(new URL(`../../../web/public/terrain/edges/${variant}.svg`, import.meta.url), 'utf8')
    const pathAttributes = Array.from(drawableSvg(svg).matchAll(/<path\b([^>]*)\/>/g), (pathMatch) => pathMatch[1])
    const pathData = pathAttributes.map((attributes) => attributes.match(/\bd="([^"]+)"/)?.[1])
    const strokeWidths = pathAttributes.map((attributes) => Number(attributes.match(/stroke-width="([\d.]+)"/)?.[1]))
    const lineCaps = pathAttributes.map((attributes) => attributes.match(/stroke-linecap="([^"]+)"/)?.[1])
    const expectedColor = '#604b35'

    expect(pathData).toEqual(isStream
      ? [segmentPaths[index], segmentPaths[index]]
      : [segmentPaths[index], segmentPaths[index], 'M0 3.5 V12.5 M72 3.5 V12.5'])
    expect(strokeWidths).toEqual(isStream ? [9, 5.4] : [9, 5.4, 1.8])
    expect(lineCaps).toEqual(isStream ? ['butt', 'butt'] : ['butt', 'butt', 'butt'])
    expect(pathAttributes[0]).toContain(`stroke="${expectedColor}"`)
    expect(pathAttributes[1]).toContain(
      isStream ? 'stroke="url(#stream-highlight)"' : 'stroke="url(#ridge-texture)"',
    )
    if (!isStream) expect(pathAttributes[2]).toContain(`stroke="${expectedColor}"`)
  })

  it('uses grouped transverse dark-brown lines across ridge segments and corners', () => {
    const patterns = ridgeAssets.map((asset) => {
      const svg = readFileSync(new URL(`../../../web/public/terrain/edges/${asset}`, import.meta.url), 'utf8')
      return ridgeTexturePattern(svg)
    })

    expect(patterns.every((pattern) => pattern !== undefined)).toBe(true)
    expect(new Set(patterns.slice(0, 4)).size).toBe(4)
    expect(patterns.slice(0, 4).map((pattern) => pattern?.match(/<path d="([^"]+)"/)?.[1])).toEqual([
      'M1.5 -1 L1.9 6 M5.3 6 L4.9 -1 M10.7 -1 L11.4 6 M15.1 6 L14.6 -1',
      'M1.1 6 L1.5 -1 M4.8 -1 L5.3 6 M11.4 6 L10.8 -1 M14.2 -1 L14.8 6',
      'M2.2 -1 L1.8 6 M5.4 6 L5 -1 M10.2 -1 L10.9 6 M15.6 6 L15.1 -1',
      'M1.2 6 L1.7 -1 M4.1 -1 L4.5 6 M10.8 6 L10.2 -1 M14.5 -1 L15.1 6',
    ])
    expect(patterns[0]).toContain('width="18" height="5"')
    expect(patterns[0]).toContain('fill="#bf9569"')
    expect(patterns[0]).toContain('stroke="#3f2b20" stroke-width="0.45"')
    expect(patterns[4]).toContain('width="40" height="40"')
    expect(patterns[4]).toContain('M19.3 16.25 L24.45 18.03 M18.68 20 H24.08 M19.3 23.75 L24.45 21.97')
    expect(patterns[4]).toContain('stroke="#715d48" stroke-width="0.3"')
  })

  it('uses the same directional stream ripples on segments and corners', () => {
    const assets = streamAssets.map((asset) =>
      readFileSync(new URL(`../../../web/public/terrain/edges/${asset}`, import.meta.url), 'utf8'),
    )
    const patterns = assets.map(streamHighlightPattern)
    const segmentPatterns = patterns.slice(0, 4)

    expect(patterns.every((pattern) => pattern !== undefined)).toBe(true)
    expect(new Set(segmentPatterns).size).toBe(1)
    expect(patterns[4]).toContain('patternTransform="rotate(90) scale(0.68,1)"')
    expect(patterns[4]).toContain('stroke="#3e6d6f" stroke-width="0.4"')
    expect(patterns[4]).toContain('width="12" height="4"')
    expect(segmentPatterns[0]).toContain('width="15" height="4"')
    expect(segmentPatterns[0]).toContain('fill="#285d5f"')
    expect(segmentPatterns[0]).toContain('stroke="#3e6d6f" stroke-width="0.4"')
    expect(segmentPatterns[0]).toContain('M1 1.15 C2.5 0.55 4 1.75 5.5 1.15 M8.5 3.05 C10 2.45 11.5 3.65 13 3.05')
  })

  it.each([
    { terrain: 'ridge', asset: 'ridge-corner.svg' },
    { terrain: 'stream', asset: 'stream-corner.svg' },
  ])('aligns the $terrain corner asset to the segment inset with a 60-degree turn', ({ terrain, asset }) => {
    const svg = readFileSync(new URL(`../../../web/public/terrain/edges/${asset}`, import.meta.url), 'utf8')
    const drawings = drawableSvg(svg)
    const match = drawings.match(/<path d="M(-?[\d.]+) (-?[\d.]+) Q(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)"/)
    if (match === null) throw new Error(`Corner asset has no supported quadratic path: ${asset}`)
    const pathAttributes = Array.from(drawings.matchAll(/<path\b([^>]*)\/>/g), (pathMatch) => pathMatch[1])
    const pathData = pathAttributes.map((attributes) => attributes.match(/\bd="([^"]+)"/)?.[1])
    const lineCaps = pathAttributes.map((attributes) => attributes.match(/stroke-linecap="([^"]+)"/)?.[1])
    const strokeWidths = pathAttributes.map((attributes) => Number(attributes.match(/stroke-width="([\d.]+)"/)?.[1]))

    const startX = Number(match[1])
    const startY = Number(match[2])
    const controlX = Number(match[3])
    const controlY = Number(match[4])
    const endX = Number(match[5])
    const endY = Number(match[6])
    const startRadius = Math.hypot(startX - 20, startY - 20)
    const endRadius = Math.hypot(endX - 20, endY - 20)
    const startTangent = { x: controlX - startX, y: controlY - startY }
    const endTangent = { x: endX - controlX, y: endY - controlY }
    const tangentCosine = (startTangent.x * endTangent.x + startTangent.y * endTangent.y)
      / (Math.hypot(startTangent.x, startTangent.y) * Math.hypot(endTangent.x, endTangent.y))

    expect(startRadius).toBeCloseTo(5.5, 2)
    expect(endRadius).toBeCloseTo(5.5, 2)
    expect(Math.acos(tangentCosine) * (180 / Math.PI)).toBeCloseTo(60, 1)
    expect(pathAttributes).toHaveLength(2)
    expect(pathData[0]).toBe(pathData[1])
    if (terrain === 'stream') {
      expect(pathAttributes[1]).toContain('stroke="url(#stream-highlight)"')
    } else {
      expect(pathAttributes[0]).toContain('stroke="#604b35"')
      expect(pathAttributes[1]).toContain('stroke="url(#ridge-texture)"')
    }
    expect(lineCaps).toEqual(Array(pathAttributes.length).fill('butt'))
    expect(strokeWidths[1] / strokeWidths[0]).toBeCloseTo(0.6, 3)
    expect((strokeWidths[0] - strokeWidths[1]) / (2 * strokeWidths[0])).toBeCloseTo(0.2, 3)
  })
})
