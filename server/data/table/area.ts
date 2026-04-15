import { Database, Statement } from "jsr:@db/sqlite";
import { Position, QuaternionTuple } from "../../types.ts";


export type AreaRecord = {
	uuid?: string
	ownerIdentityId?: string
	ownerName?: string
	ownerAvatarUrl?: string
	planetId?: string
	label?: string
	position?: Position
}

export class AreaTable {
	private upsert: Statement
	private selectAll: Statement
	private selectById: Statement
	private delete: Statement

	constructor(db: Database) {
		db.exec(
			`CREATE TABLE IF NOT EXISTS area (
			uuid TEXT PRIMARY KEY,
			ownerIdentityId TEXT,
			planetId TEXT,
			position TEXT,
			quaternion TEXT,
			label TEXT,
			FOREIGN KEY(ownerIdentityId) REFERENCES identity(id)
		  );`
		)

		this.upsert = db.prepare(`INSERT INTO area
		(uuid, ownerIdentityId, planetId, position, quaternion, label) 
		VALUES (:uuid, :ownerIdentityId, :planetId, :position, :quaternion, :label)
		ON CONFLICT(uuid)
		DO UPDATE SET 
			ownerIdentityId = excluded.ownerIdentityId,
			planetId = excluded.planetId,
			position = excluded.position,
			quaternion = excluded.quaternion,
			label = excluded.label
		RETURNING *;`
		)
	
		this.selectAll = db.prepare(`SELECT a.*, i.name ownerName, i.avatar_url ownerAvatarUrl
			FROM area a INNER JOIN identity i on i.id = ownerIdentityId;`)

		this.selectById = db.prepare(`SELECT * FROM area WHERE uuid = :uuid AND ownerIdentityId = :ownerIdentityId LIMIT 1;`)
		this.delete = db.prepare(`DELETE FROM area WHERE uuid = :uuid AND ownerIdentityId = :ownerIdentityId;`)
	}

	add = (area: AreaRecord) => this.upsert.run({...area})
	update = (area: AreaRecord) => this.upsert.run({...area})
	remove = (uuid: string, ownerIdentityId: string) => this.delete.run({uuid, ownerIdentityId})
	getAll = () => this.selectAll.all()
	getById = (uuid: string, ownerIdentityId: string) => this.selectById.get({uuid, ownerIdentityId}) as AreaRecord
}