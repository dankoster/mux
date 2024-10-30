import { Database } from "jsr:@db/sqlite";
import { assertEquals } from "jsr:@std/assert";
import type { Connection, Identity, Room } from "./api.ts";

//const db = new Database("test.db");

const db = new Database("data.db");

db.prepare(`PRAGMA journal_mode=WAL;`).run()
db.prepare(`PRAGMA foreign_keys = ON;`).run()

const createTableIdentity = db.prepare(`CREATE TABLE IF NOT EXISTS identity (
	id INTEGER PRIMARY KEY,
	source TEXT,
	source_id TEXT,
	name TEXT,
	avatar_url TEXT);`)

const createTableConnection = db.prepare(`CREATE TABLE IF NOT EXISTS connection (
		uuid TEXT PRIMARY KEY,
		id TEXT NOT NULL,
		identityId INTEGER,
		color TEXT,
		text TEXT,
		status TEXT,
		roomId TEXT,
		kind TEXT,
		FOREIGN KEY(identityId) REFERENCES identity(id));`)

const createTableRoom = db.prepare(`CREATE TABLE IF NOT EXISTS room (
		id TEXT PRIMARY KEY,
		ownerId TEXT);`)

//can't prepare queries before creating the tables they depend upon
createTableIdentity.run()
createTableRoom.run()
createTableConnection.run()

const upsertRoom = db.prepare(`
	INSERT
	INTO room ( id, ownerId )
	VALUES ( :id, :ownerId )
	ON CONFLICT(id)
	DO UPDATE SET 
		ownerId = excluded.ownerId
	RETURNING *;
`)

const deleteConnectionByUUID = db.prepare(`DELETE FROM connection WHERE uuid = :uuid`)
const deleteRoomByIds = db.prepare(`DELETE FROM room WHERE id = :id AND ownerId = :ownerId;`)
const selectRooms = db.prepare(`SELECT * FROM room;`)

const upsertConnection = db.prepare(`
	INSERT 
	INTO connection (uuid, id, identityId, color, text, status, roomId, kind) 
	VALUES (:uuid, :id, :identityId, :color, :text, :status, :roomId, :kind)
	ON CONFLICT(uuid)
	DO UPDATE SET 
		id = excluded.id,
		identityId = excluded.identityId,
		color = excluded.color,
		text = excluded.text,
		status = excluded.status,
		roomId = excluded.roomId,
		kind = excluded.kind
	RETURNING *;`
)

const upsertIdentity = db.prepare(`INSERT 
	INTO identity (id, source, source_id, name, avatar_url) 
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
const selectIdentityBySource = db.prepare(
	`SELECT * 
	FROM identity 
	WHERE source = :source 
	AND source_id = :source_id;`
)

export function persistRoom(room: Room) {
	return upsertRoom.get({...room})
}

export function deleteRoom(room: Room) {
	return deleteRoomByIds.get({...room})
}

export function deleteConnection(uuid: string) {
	return deleteConnectionByUUID.get({uuid})
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

	const conResult = upsertConnection.get(dbCon)
	console.log('DB UPSERTED', conResult, idResult)
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

export function getRoomsByUUID() {
	const rooms = selectRooms.all()
	const result = new Map<string, Room>()
	rooms.forEach(r => result.set(r.id, r as Room))
	return result
}

function removeNullFields(obj: any) {
	for (const prop in obj) {
		if (obj[prop] == null)
			delete obj[prop]
		else if(typeof obj[prop] === 'object')
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

//test()

//db.close();