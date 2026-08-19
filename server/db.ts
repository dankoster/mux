import { Database } from "jsr:@db/sqlite";
import { assertEquals } from "jsr:@std/assert";
import type { Connection } from "./types.ts";
import { IdentityTable } from "./data/table/identity.ts";
import { AreaTable } from "./data/table/area.ts";
import { FriendTable } from "./data/table/friend.ts";
import { FriendRequestTable } from "./data/table/friendRequest.ts";
import { ConnectionTable } from "./data/table/connection.ts";
import { DirectMessageTable } from "./data/table/directMessage.ts";

const db = new Database("data.db");

db.exec(`PRAGMA journal_mode=WAL;`)
db.exec(`PRAGMA foreign_keys = ON;`)

const identity = new IdentityTable(db)
export const area = new AreaTable(db)
const friend = new FriendTable(db)
export const friendRequest = new FriendRequestTable(db, friend)
export const connection = new ConnectionTable(db, identity)
export const directMessage = new DirectMessageTable(db)

export function serverInitAndCleanup() {
	const cleanup1 = connection.deleteConnectionsWherePositionIsNull()
	console.log('serverInitAndCleanup ->',`Deleted ${cleanup1} from table connection with NULL position`)
	const cleanup2 = connection.setAllConnectionsStatusToNull()
	console.log('serverInitAndCleanup ->',`Set ${cleanup2} in table connection to status NULL`)
	const cleanup3 = db.exec(`DROP TABLE IF EXISTS log;`)
	console.log('serverInitAndCleanup ->',`Removed log table (result: ${cleanup3})`)
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

	connectionByUUID.forEach((con, uuid) => connection.persistConnection(uuid, con))

	const cons = connection.getConnectionsByUUID()

	assertEquals(connectionByUUID, cons)
}
