declare module 'pino/browser.js' {
  const pino: typeof import('pino')
  export default pino
  export type Logger = import('pino').Logger
}
