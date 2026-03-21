import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

import { executeCommand, renderHelpText, renderStatusText } from './runtime.js'
import { parseCommand } from './parser.js'
import { createSessionStore } from './session/store.js'


function getPrompt(session: { username: string | null; role: string | null }): string {
  if (session.username && session.role) {
    return `onion-cli(${session.username}/${session.role})> `
  }
  if (session.username) {
    return `onion-cli(${session.username})> `
  }
  return 'onion-cli> '
}

function writeCliOutput(message: string): void {
  output.write(`${message.replace(/\n+$/u, '')}\n`)
}

function printWelcome(): void {
  output.write("Onion CLI v1 scaffold\nType 'help' for available commands.\n\n")
}

export async function startCli(): Promise<void> {
  const session = createSessionStore()
  const rl = createInterface({ input, output, terminal: true })

  printWelcome()

  try {
    while (true) {
      const line = await rl.question(getPrompt(session))
      const parsed = parseCommand(line)

      if (!parsed.ok) {
        if (parsed.error !== 'empty command') {
          writeCliOutput(`Parse error\n${parsed.error}`)
        }
        continue
      }

      const command = parsed.command

      if (command.kind === 'help') {
        writeCliOutput(renderHelpText(command.topic))
        continue
      }

      if (command.kind === 'status') {
        writeCliOutput(renderStatusText(session))
        continue
      }

      const result = await executeCommand(session, command)
      writeCliOutput(result.message)
      if (result.exitRequested) {
        break
      }
    }
  } finally {
    rl.close()
  }
}