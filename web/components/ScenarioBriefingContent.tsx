import { Fragment } from 'react'
import type { ScenarioInfoData, ScenarioInfoObjective } from '../lib/scenarioInfo'

type DescriptionBlock =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; items: string[] }

function parseDescription(text: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = []
  let paragraphLines: string[] = []
  let listItems: string[] = []

  function flushParagraph() {
    if (paragraphLines.length > 0) {
      blocks.push({ kind: 'paragraph', lines: paragraphLines })
      paragraphLines = []
    }
  }

  function flushList() {
    if (listItems.length > 0) {
      blocks.push({ kind: 'list', items: listItems })
      listItems = []
    }
  }

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim() === '') {
      flushParagraph()
      flushList()
      continue
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/)
    if (bullet) {
      flushParagraph()
      listItems.push(bullet[1])
    } else {
      flushList()
      paragraphLines.push(line)
    }
  }

  flushParagraph()
  flushList()
  return blocks
}

export function ScenarioDescription({ text, className }: { text: string; className?: string }) {
  const classNames = ['scenario-authored-text', className].filter(Boolean).join(' ')

  return (
    <div className={classNames}>
      {parseDescription(text).map((block, index) => block.kind === 'list'
        ? <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
        : (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                <span>{line}</span>
              </Fragment>
            ))}
          </p>
        ))}
    </div>
  )
}

export function ScenarioVictoryConditions({
  objectives,
}: Pick<ScenarioInfoData, 'objectives'>) {
  const sides = [
    { id: 'onion', label: 'The Onion' },
    { id: 'defender', label: 'Defenders' },
  ] as const

  return (
    <>
      <div className="scenario-victory-grid" role="group" aria-label="Victory conditions">
        {sides.map((side) => {
          const sideObjectives = objectives.filter((objective) => objective.victor === side.id)
          return (
            <section className="scenario-victory-side" key={side.id}>
              <h3>{side.label}</h3>
              {sideObjectives.length > 0 ? (
                <ul className="scenario-info-objective-list">
                  {sideObjectives.map((objective) => (
                    <li
                      key={objective.id}
                      className={objective.completed ? 'is-complete' : undefined}
                      title={objective.detail}
                    >
                      <strong>{objective.label}</strong>
                      {objective.completed ? <span>Complete</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          )
        })}
      </div>
      {objectives.length === 0 ? <p className="scenario-info-muted">No objective details are available.</p> : null}
    </>
  )
}

export function ScenarioForceManifest({ manifest }: { manifest: ScenarioInfoData['manifest'] }) {
  const sides = [
    { id: 'onion', label: 'The Onion', entries: manifest.onion },
    { id: 'defender', label: 'Defenders', entries: manifest.defender },
  ] as const

  return (
    <div className="scenario-info-manifest-columns">
      {sides.map((side) => (
        <section key={side.id}>
          <h3>{side.label}</h3>
          {side.entries.length > 0 ? <ul>{side.entries.map((entry) => <li key={entry}>{entry}</li>)}</ul> : <p className="scenario-info-muted">No manifest available.</p>}
        </section>
      ))}
    </div>
  )
}

export type { ScenarioInfoObjective }