import { Database, Statement } from "jsr:@db/sqlite";
import { Connection } from "../../types.ts";
import { Identity, IdentityTable } from "./identity.ts";

export class ConnectionTable {

	db: Database
	identityTable: IdentityTable
	updatePublicKey: Statement
	updatePosition: Statement
	deleteConnectionByUUID: Statement
	upsertConnection: Statement
	selectConnections: Statement

	constructor(db: Database, identityTable: IdentityTable) {
		db.exec(`CREATE TABLE IF NOT EXISTS connection (
		uuid TEXT PRIMARY KEY,
		id TEXT NOT NULL,
		identityId INTEGER,
		color TEXT,
		status TEXT,
		kind TEXT,
		publicKey TEXT,
		position TEXT,
		quaternion TEXT,
		FOREIGN KEY(identityId) REFERENCES identity(id));`
		)

		// AddColumn_IfNotExists({ tableName: 'connection', columnName: 'publicKey', columnType: 'TEXT' })
		// AddColumn_IfNotExists({ tableName: 'connection', columnName: 'position', columnType: 'TEXT' }) //store position as JSON {x:123,y:123,z:123}
		// AddColumn_IfNotExists({ tableName: 'connection', columnName: 'quaternion', columnType: 'TEXT' }) //store quaternion as JSON [1,2,3,4]
		// DropColumn({tableName: 'connection', columnName: 'text'})
		// DropColumn({tableName: 'connection', columnName: 'roomId'})

		this.identityTable = identityTable
		this.db = db

		this.updatePublicKey = db.prepare(
			`UPDATE connection 
			SET publicKey = :publicKey 
			WHERE uuid = :uuid
			RETURNING *;`)

		this.updatePosition = db.prepare(
			`UPDATE connection 
				SET position = :position, quaternion = :quaternion
				WHERE uuid = :uuid
				RETURNING *;`)

		this.deleteConnectionByUUID = db.prepare(`DELETE FROM connection WHERE uuid = :uuid`)

		this.upsertConnection = db.prepare(`INSERT INTO connection 
			(uuid, id, identityId, color, status, kind, publicKey, position, quaternion) 
			VALUES (:uuid, :id, :identityId, :color, :status, :kind, :publicKey, :position, :quaternion)
			ON CONFLICT(uuid)
			DO UPDATE SET 
				id = excluded.id,
				identityId = excluded.identityId,
				color = excluded.color,
				status = excluded.status,
				kind = excluded.kind,
				publicKey = excluded.publicKey,
				position = excluded.position,
				quaternion = excluded.quaternion
			RETURNING *;`
		)

		this.selectConnections = db.prepare(`SELECT * FROM connection;`)
	}

	persistPublicKey({ uuid, publicKey }: { uuid: string, publicKey: string }) {
		return this.updatePublicKey.all({ uuid, publicKey })
	}
	persistPosition({ uuid, position, quaternion }: { uuid: string, position: string, quaternion: string }) {
		return this.updatePosition.run({ uuid, position, quaternion })
	}

	deleteConnection(uuid: string) {
		return this.deleteConnectionByUUID.get({ uuid })
	}

	persistConnection(uuid: string, con: Connection) {

		let idResult: Identity | undefined = undefined
		if (con.identity) {
			const cid = con.identity
			if (!cid.id && cid.source && cid.source_id) {
				//try to reclaim a previously saved identity
				idResult = this.identityTable.selectBySource.get(cid.source, cid.source_id)
				// console.log('selected', idResult)
			}

			if (!idResult) {
				idResult = this.identityTable.upsert.get(cid)
				// console.log('upserted', idResult)
			}
		}

		const dbCon = {
			uuid,
			identityId: idResult?.id || null,
			...con,
		}
		delete dbCon.identity

		const conResult = this.upsertConnection.get(dbCon) as Connection
		// console.log('DB UPSERTED', conResult, idResult)

		if (conResult && !conResult.identity) {
			conResult.identity = idResult
		}
		return conResult
	}

	getConnectionsByUUID() {
		const connections = this.selectConnections.all()

		const result = new Map<string, Connection>()
		connections.forEach(c => {
			const con = { ...c }
			delete con.uuid //this is the auth token! don't leak!
			delete con.identityId
			if (c.identityId) {
				const ident = this.identityTable.selectById.get({ id: c.identityId })
				con.identity = ident as Identity
			}
			removeNullFields(con)
			result.set(c.uuid, con as Connection)
		})

		return result
	}

	deleteConnectionsWherePositionIsNull() {
		return this.db.exec(`DELETE FROM connection WHERE position IS NULL`)
	}

	setAllConnectionsStatusToNull() {
		return this.db.exec(`UPDATE connection SET status = NULL`) 
	}

}

function removeNullFields(obj: any) {
	for (const prop in obj) {
		if (obj[prop] == null)
			delete obj[prop]
		else if (typeof obj[prop] === 'object')
			removeNullFields(obj[prop])
	}
}
