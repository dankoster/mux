import { Database, Statement } from "jsr:@db/sqlite"
import { Friend } from "../../types.ts";

// export type Friend = {

// }

export class FriendTable {

	selectFriends: Statement
	upsertFriend: Statement

	constructor(db: Database) {
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
			CHECK(myId != friendId));`
		)

		this.selectFriends = db.prepare(`SELECT * FROM friend
			WHERE myId = :myId`
		)

		this.upsertFriend = db.prepare(`INSERT INTO friend 
			(myId, friendId, status)
			VALUES (:myId, :friendId, :status)
			ON CONFLICT(myId, friendId)
			DO UPDATE SET 
				status = excluded.status,
				updated = unixepoch('subsec')
			RETURNING *;`
		)
		
	}

	getFriendsByIdentityId(identityId: string) {
		return this.selectFriends.all<Friend>({ myId: identityId })
	}
}