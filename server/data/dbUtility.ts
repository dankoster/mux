import { Database } from "jsr:@db/sqlite";

export function AddColumn_IfNotExists({ db, tableName, columnName, columnType, references }: 
	{ db: Database, tableName: string, columnName: string, columnType: "TEXT"|"INTEGER", references: string }) {
	const transaction = db.transaction(() => {
		const getColumns = db.prepare(
			`SELECT ti.name AS 'column'
			FROM sqlite_schema AS m,
			pragma_table_info(m.name) AS ti
			WHERE m.type='table'
			AND m.name = :tableName
			`
		)
		const columns = getColumns.all<{ ['column']: string }>({ tableName })

		if (columns.length === 0) {
			console.log('ADD COLUMN', `ERROR: table ${tableName} has no existing columns!`)
			return
		}
		if (columns.some(c => c.column === columnName)) {
			console.log('ADD COLUMN', `column already exists: ${tableName}.${columnName} ${columnType}`)
			return
		}

		console.log('ADD COLUMN', `Column ${columnName} NOT FOUND in ${tableName}. Adding...`)
		const command = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}${references ? ` REFERENCES ${references}`:''}`
		//console.log(command)
		db.exec(command)
	})
	transaction()
}

export function DropColumn({ db, tableName, columnName }: { db: Database, tableName: string, columnName: string }) {
	const transaction = db.transaction(() => {
		const getColumns = db.prepare(
			`SELECT ti.name AS 'column'
			FROM sqlite_schema AS m,
			pragma_table_info(m.name) AS ti
			WHERE m.type='table'
			AND m.name = :tableName
			`
		)
		const columns = getColumns.all<{ ['column']: string }>({ tableName })

		if (columns.length === 0) {
			console.log('DROP COLUMN', `ERROR: table ${tableName} has no existing columns!`)
			return
		}
		if (!columns.some(c => c.column === columnName)) {
			console.log('DROP COLUMN', `column already gone: ${tableName}.${columnName}`)
			return
		}

		console.log('DROP COLUMN', `${tableName}.${columnName}...`)
		db.exec(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`)
	})
	transaction()
}
