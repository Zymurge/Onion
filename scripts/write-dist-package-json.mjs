import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const distPackage = {
	type: 'module',
	imports: {
		'#server/*': './server/*.js',
		'#shared/*': './shared/*.js',
	},
}

await writeFile(resolve('dist/package.json'), `${JSON.stringify(distPackage, null, 2)}\n`)

const migrationsSource = resolve('server/db/migrations')
const migrationsDestination = resolve('dist/server/db/migrations')
await mkdir(migrationsDestination, { recursive: true })
for (const fileName of await readdir(migrationsSource)) {
	if (fileName.endsWith('.sql')) {
		await copyFile(resolve(migrationsSource, fileName), resolve(migrationsDestination, fileName))
	}
}