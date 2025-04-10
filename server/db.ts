import { Database } from "jsr:@db/sqlite";
import { assertEquals } from "jsr:@std/assert";
import type { Connection, DM, DMInsert, DMRequest, Friend, FriendRequest, Identity } from "./types.ts";

const db = new Database("data.db");

db.exec(`PRAGMA journal_mode=WAL;`)
db.exec(`PRAGMA foreign_keys = ON;`)

db.exec(`CREATE TABLE IF NOT EXISTS identity (
		id INTEGER PRIMARY KEY,
		source TEXT,
		source_id TEXT,
		name TEXT,
		avatar_url TEXT
	);`
)

db.exec(`CREATE TABLE IF NOT EXISTS friend (
		id INTEGER PRIMARY KEY,
		myId INTEGER,
		friendId INTEGER,
		status TEXT,
		created TEXT NOT NULL DEFAULT (unixepoch('subsec')),
		updated TEXT NOT NULL DEFAULT (unixepoch('subsec')),
		UNIQUE(myId,friendId)
		FOREIGN KEY(myId) REFERENCES identity(id)
		FOREIGN KEY(friendId) REFERENCES identity(id)
		CHECK(myId != friendId)
	);`
)

db.exec(`CREATE TABLE IF NOT EXISTS friendRequest (
		id INTEGER PRIMARY KEY,
		fromId INTEGER,
		toId INTEGER,
		status TEXT DEFAULT 'requested',
		created TEXT NOT NULL DEFAULT (unixepoch('subsec')),
		updated TEXT NOT NULL DEFAULT (unixepoch('subsec')),
		UNIQUE(fromId,toId)
		FOREIGN KEY(fromId) REFERENCES identity(id)
		FOREIGN KEY(toId) REFERENCES identity(id)
		CHECK(fromId != toId)
	);`
)

db.exec(`CREATE TABLE IF NOT EXISTS connection (
		uuid TEXT PRIMARY KEY,
		id TEXT NOT NULL,
		identityId INTEGER,
		color TEXT,
		text TEXT,
		status TEXT,
		kind TEXT,
		FOREIGN KEY(identityId) REFERENCES identity(id)
	);`
)

db.exec(`CREATE TABLE IF NOT EXISTS directMessage (
	id INTEGER PRIMARY KEY,
	toUuid TEXT NOT NULL, 
	fromUuid TEXT NOT NULL,
	message TEXT,
	timestamp TEXT NOT NULL DEFAULT (unixepoch('subsec')),
	FOREIGN KEY(toUuid) REFERENCES connection(uuid),
	FOREIGN KEY(fromUuid) REFERENCES connection(uuid),
	CHECK(fromUuid != toUuid));`
)

const insertDm = db.prepare(`INSERT INTO directMessage 
	(toUuid, fromUuid, message)
	VALUES (:toUuid, :fromUuid, :message)
	RETURNING *;`
)

const selectDmRangeBeforeTimestamp = db.prepare(`
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

const selectAllDmsAfterTimestamp = db.prepare(`SELECT * FROM (
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

export function persistDm(dm: DMInsert) {
	return insertDm.get(dm) as DM
}

export function getDirectMessagesBeforeTimestamp(uuid1: string, uuid2: string, req: DMRequest) {
	return selectDmRangeBeforeTimestamp.all({ uuid1, uuid2, timestamp: req.timestamp, qty: req.qty })
}

export function getDriectMessagesAfterTimestamp(uuid1: string, uuid2: string, timestamp: number) {
	const subsecondTimestamp = timestamp / 1000
	return selectAllDmsAfterTimestamp.all({ uuid1, uuid2, timestamp: subsecondTimestamp })
}

AddColumn_IfNotExists({ tableName: 'connection', columnName: 'publicKey', columnType: 'TEXT' })
AddColumn_IfNotExists({ tableName: 'connection', columnName: 'position', columnType: 'TEXT' }) //store position as JSON {x:123,y:123,z:123}

function AddColumn_IfNotExists({ tableName, columnName, columnType }: { tableName: string, columnName: string, columnType: "TEXT" }) {
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
		db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`)
	})
	transaction()
}

export function persistPublicKey({ uuid, publicKey }: { uuid: string, publicKey: string }) {
	const updatePublicKey = db.prepare(
		`UPDATE connection 
		SET publicKey = :publicKey 
		WHERE uuid = :uuid
		RETURNING *;`)
	return updatePublicKey.all({ uuid, publicKey })
}

export function persistPosition({ uuid, position }: { uuid: string, position: string }) {
	const updatePublicKey = db.prepare(
		`UPDATE connection 
		SET position = :position 
		WHERE uuid = :uuid
		RETURNING *;`)
	return updatePublicKey.all({ uuid, position })
}



const deleteConnectionByUUID = db.prepare(`DELETE FROM connection WHERE uuid = :uuid`)

const upsertConnection = db.prepare(`INSERT INTO connection 
	(uuid, id, identityId, color, text, status, kind, publicKey, position) 
	VALUES (:uuid, :id, :identityId, :color, :text, :status, :kind, :publicKey, :position)
	ON CONFLICT(uuid)
	DO UPDATE SET 
		id = excluded.id,
		identityId = excluded.identityId,
		color = excluded.color,
		text = excluded.text,
		status = excluded.status,
		kind = excluded.kind,
		publicKey = excluded.publicKey,
		position = excluded.position
	RETURNING *;`
)

const upsertIdentity = db.prepare(`INSERT INTO identity 
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

const selectConnections = db.prepare(`SELECT * FROM connection;`)
const selectIdentityById = db.prepare(`SELECT * FROM identity WHERE id = :id;`)
const selectIdentityBySource = db.prepare(`SELECT * FROM identity 
	WHERE source = :source 
	AND source_id = :source_id;`
)

const selectFriends = db.prepare(`SELECT * FROM friend
	WHERE myId = :myId`
)

const insertFriendRequest = db.prepare(`INSERT INTO friendRequest 
	(fromId, toId)
	VALUES (:fromId, :toId)
	RETURNING *;`
)
const updateFriendRequest = db.prepare(`UPDATE friendRequest
	SET status = :status
	WHERE id = :id
	RETURNING *;`
)
const selectFriendRequest = db.prepare(`SELECT * FROM friendRequest WHERE id = :id;`)

const selectFriendRequests = db.prepare(`SELECT * FROM friendrequest 
	WHERE fromId = :identityId 
	AND status = 'requested'
	UNION
	SELECT * 
	FROM friendRequest
	WHERE toId = :identityId
	AND status = 'requested';`
)
const upsertFriend = db.prepare(`INSERT INTO friend 
	(myId, friendId, status)
	VALUES (:myId, :friendId, :status)
	ON CONFLICT(myId, friendId)
	DO UPDATE SET 
		status = excluded.status,
		updated = unixepoch('subsec')
	RETURNING *;`
)

export function getFriendsByIdentityId(identityId: string) {
	return selectFriends.all<Friend>({ myId: identityId })
}
export function getFriendRequestsByIdentityId(identityId: string) {
	return selectFriendRequests.all<FriendRequest>({ identityId })
}

export function addFriendRequest(fromId: string, toId: string) {
	const result = insertFriendRequest.get<FriendRequest>({
		fromId: fromId,
		toId: toId
	})
	console.log("ADD FRIEND REQUEST", result)
	return result
}

export function acceptFriendRequest(id: string) {
	//const result:{request: FriendRequest|undefined, friends: Friend|undefined[]|undefined} = {friends: []}
	const updateFriendRequestTransaction = db.transaction(() => {
		const fr = selectFriendRequest.get<FriendRequest>({ id })
		if (fr === undefined) throw new Error(`no friend requst with id ${id}`)
		const requestor = upsertFriend.get<Friend>({ myId: fr.fromId, friendId: fr.toId })
		const requestee = upsertFriend.get<Friend>({ myId: fr.toId, friendId: fr.fromId })
		const request = updateFriendRequest.get<FriendRequest>({ id, status: 'accepted' })

		return { request, requestor, requestee }
	})
	console.log("ACCEPT FRIEND REQUEST", id)
	return updateFriendRequestTransaction()
}

export function serverInitAndCleanup() {
	return db.exec(`UPDATE connection SET status = NULL`)
}

export function deleteConnection(uuid: string) {
	return deleteConnectionByUUID.get({ uuid })
}

export function persistConnection(uuid: string, con: Connection) {

	let idResult: Identity | undefined = undefined
	if (con.identity) {
		const cid = con.identity
		if (!cid.id && cid.source && cid.source_id) {
			//try to reclaim a previously saved identity
			idResult = selectIdentityBySource.get(cid.source, cid.source_id)
			// console.log('selected', idResult)
		}

		if (!idResult) {
			idResult = upsertIdentity.get(cid)
			// console.log('upserted', idResult)
		}
	}

	const dbCon = {
		uuid,
		identityId: idResult?.id || null,
		...con,
	}
	delete dbCon.identity

	const conResult = upsertConnection.get(dbCon) as Connection
	// console.log('DB UPSERTED', conResult, idResult)

	if (conResult && !conResult.identity) {
		conResult.identity = idResult
	}
	return conResult
}

export function getConnectionsByUUID() {
	const connections = selectConnections.all()

	const result = new Map<string, Connection>()
	connections.forEach(c => {
		const con = { ...c }
		delete con.uuid
		delete con.identityId
		if (c.identityId) {
			const ident = selectIdentityById.get({ id: c.identityId })
			con.identity = ident as Identity
		}
		removeNullFields(con)
		result.set(c.uuid, con as Connection)
	})

	return result
}

function removeNullFields(obj: any) {
	for (const prop in obj) {
		if (obj[prop] == null)
			delete obj[prop]
		else if (typeof obj[prop] === 'object')
			removeNullFields(obj[prop])
	}
}

function test() {
	const connectionByUUID = new Map<string, Connection>()

	connectionByUUID.set('AAA', {
		id: "idAAA",
		color: 'colorAAA',
		identity: {
			// id: '1',
			source: 'test',
			source_id: '1234',
			name: 'dan',
			avatar_url: 'http://test.test/test.png'
		}
	})

	connectionByUUID.set('XXX', {
		status: 'online',
		id: "idXXX",
	})

	connectionByUUID.forEach((con, uuid) => persistConnection(uuid, con))

	const cons = getConnectionsByUUID()

	assertEquals(connectionByUUID, cons)
}
