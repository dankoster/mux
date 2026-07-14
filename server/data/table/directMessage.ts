import { Database, Statement } from "jsr:@db/sqlite";
import { DM, DMInsert, DMRequest } from "../../types.ts";

export class DirectMessageTable {

	insertDm: Statement
	selectDmRangeBeforeTimestamp: Statement
	selectAllDmsAfterTimestamp: Statement

	constructor(db: Database) {

		db.exec(`CREATE TABLE IF NOT EXISTS directMessage (
			id INTEGER PRIMARY KEY,
			toUuid TEXT NOT NULL, 
			fromUuid TEXT NOT NULL,
			message TEXT,
			timestamp TEXT NOT NULL DEFAULT (unixepoch('subsec')),
			FOREIGN KEY(toUuid) REFERENCES connection(uuid),
			FOREIGN KEY(fromUuid) REFERENCES connection(uuid),
			CHECK(fromUuid != toUuid));`)

		this.insertDm = db.prepare(`INSERT INTO directMessage 
			(toUuid, fromUuid, message)
			VALUES (:toUuid, :fromUuid, :message)
			RETURNING *;`
		)

		this.selectDmRangeBeforeTimestamp = db.prepare(`
			WITH UUID1 AS (
				SELECT uuid FROM connection
				WHERE identityId in (
					SELECT identityId FROM connection
					WHERE uuid = :uuid1
				)
			),
			UUID2 AS (
				SELECT uuid FROM connection
				WHERE identityId in (
					SELECT identityId FROM connection
					WHERE uuid = :uuid2
				)
			)
			SELECT * FROM (
					SELECT dm.id as id, 
					cTo.id as toId, 
					cFr.id as fromId,
					iFr.name as fromName,
					dm.timestamp * 1000 as timestamp, 
					dm.message
					FROM directMessage dm
					JOIN connection cTo on cTo.uuid = dm.toUuid
					JOIN connection cFr on cFr.uuid = dm.fromUuid
					LEFT JOIN identity iFr on iFr.id = cfr.identityId
					WHERE timestamp <= :timestamp * 0.001
					AND (
						(toUuid IN UUID1 AND fromUuid IN UUID2)
						OR 
						(toUuid IN UUID2 AND fromUuid IN UUID1)
					)
					ORDER BY dm.timestamp DESC
					LIMIT :qty)
				ORDER BY id ASC;`
		)

		this.selectAllDmsAfterTimestamp = db.prepare(`SELECT * FROM (
				SELECT dm.id as id, 
				cTo.id as toId, 
				cFr.id as fromId,
				iFr.name as fromName,
				dm.timestamp * 1000 as timestamp, 
				dm.message
				FROM directMessage dm
				JOIN connection cTo on cTo.uuid = dm.toUuid
				JOIN connection cFr on cFr.uuid = dm.fromUuid
				LEFT JOIN identity iFr on iFr.id = cfr.identityId
				WHERE timestamp > :timestamp
				AND ((toUuid = :uuid1 AND fromUuid = :uuid2)
				OR (toUuid = :uuid2 AND fromUuid = :uuid1))
				ORDER BY dm.timestamp DESC)
			ORDER BY id ASC;`
		)

	}

	persistDm(dm: DMInsert) {
		return this.insertDm.get(dm) as DM
	}

	getDirectMessagesBeforeTimestamp(uuid1: string, uuid2: string, req: DMRequest) {
		return this.selectDmRangeBeforeTimestamp.all({ uuid1, uuid2, timestamp: req.timestamp, qty: req.qty })
	}

	getDriectMessagesAfterTimestamp(uuid1: string, uuid2: string, timestamp: number) {
		const subsecondTimestamp = timestamp / 1000
		return this.selectAllDmsAfterTimestamp.all({ uuid1, uuid2, timestamp: subsecondTimestamp })
	}
}