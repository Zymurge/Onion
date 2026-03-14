import { buildApp } from './app.js'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

const app = buildApp()

try {
  await app.listen({ port, host })
  console.log(`Onion Engine listening on http://${host}:${port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
