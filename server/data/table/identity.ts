import { Database, Statement } from "jsr:@db/sqlite";

export type Identity = {
	id?: number;
	source?: string;
	source_id?: string;
	name?: string;
	avatar_url?: string;
};

export class IdentityTable {
	upsert: Statement
	selectById: Statement
	selectBySource: Statement

	constructor(db: Database) {
		db.exec(
			`CREATE TABLE IF NOT EXISTS identity (
			  id INTEGER PRIMARY KEY,
			  source TEXT,
			  source_id TEXT,
			  name TEXT,
			  avatar_url TEXT
		  );`
		)

		this.upsert = db.prepare(`INSERT INTO identity 
		(id, source, source_id, name, avatar_url) 
		VALUES (:id, :source, :source_id, :name, :avatar_url)
		ON CONFLICT(id)
		DO UPDATE SET 
			name = excluded.name,
			source = excluded.source,
			source_id = excluded.source_id,
			avatar_url = excluded.avatar_url
		RETURNING *;`
		)

		this.selectById = db.prepare(
			`SELECT * FROM identity WHERE id = :id;`
		)

		this.selectBySource = db.prepare(
			`SELECT * FROM identity 
			WHERE source = :source 
			AND source_id = :source_id;`
		)

	}
}