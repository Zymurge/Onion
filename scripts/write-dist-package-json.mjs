import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const distPackage = {
	type: 'module',
	imports: {
		'#server/*': './server/*.js',
		'#shared/*': './shared/*.js',
	},
}

await writeFile(resolve('dist/package.json'), `${JSON.stringify(distPackage, null, 2)}\n`)