import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Pool } from 'pg'

export async function applyMigrations(pool: Pool, migrationsDir: string): Promise<void> {
	const migrationFiles = (await readdir(migrationsDir))
		.filter((fileName) => /^\d+.*\.sql$/i.test(fileName))
		.sort()

	for (const fileName of migrationFiles) {
		const sql = await readFile(join(migrationsDir, fileName), 'utf8')
		await pool.query(sql.split('-- migrate:down')[0].replace('-- migrate:up', ''))
	}
}