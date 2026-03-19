import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

import { executeCommand, renderHelpText, renderStatusText } from './runtime.js'
import { parseCommand } from './parser.js'
import { createSessionStore } from './session/store.js'

const PROMPT = 'onion-cli> '

function printWelcome(): void {
  output.write('Onion CLI v1 scaffold\n')
  output.write("Type 'help' for available commands.\n\n")
}

export async function startCli(): Promise<void> {
  const session = createSessionStore()
  const rl = createInterface({ input, output, terminal: true })

  printWelcome()

  try {
    while (true) {
      const line = await rl.question(PROMPT)
      const parsed = parseCommand(line)

      if (!parsed.ok) {
        if (parsed.error !== 'empty command') {
          output.write(`Parse error\n${parsed.error}\n\n`)
        }
        continue
      }

      const command = parsed.command

      if (command.kind === 'help') {
        output.write(`${renderHelpText(command.topic)}\n\n`)
        continue
      }

      if (command.kind === 'status') {
        output.write(`${renderStatusText(session)}\n\n`)
        continue
      }

      const result = await executeCommand(session, command)
      output.write(`${result.message}\n\n`)

      if (result.exitRequested) {
        break
      }
    }
  } finally {
    rl.close()
  }
}