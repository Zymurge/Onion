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

function printWelcome(): void {
  console.log('Onion CLI v1 scaffold')
  console.log("Type 'help' for available commands.\n")
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
          console.log(`Parse error\n${parsed.error}`)
        }
        rl.setPrompt(getPrompt(session))
        rl.prompt()
        continue
      }

      const command = parsed.command

      if (command.kind === 'help') {
        console.log(renderHelpText(command.topic))
        rl.setPrompt(getPrompt(session))
        rl.prompt()
        continue
      }

      if (command.kind === 'status') {
        console.log(renderStatusText(session))
        rl.setPrompt(getPrompt(session))
        rl.prompt()
        continue
      }

      const result = await executeCommand(session, command)
      console.log(result.message)
      if (result.exitRequested) {
        break
      }
      rl.setPrompt(getPrompt(session))
      rl.prompt()
    }
  } finally {
    rl.close()
  }
}