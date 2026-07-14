import { Database, Statement } from "jsr:@db/sqlite";
import { Friend, FriendRequest } from "../../types.ts";
import { FriendTable } from "./friend.ts";

export class FriendRequestTable {
	db: Database
	friendTable: FriendTable
	insertFriendRequest: Statement
	updateFriendRequest: Statement
	selectFriendRequest: Statement
	selectFriendRequests: Statement
	
	constructor(db: Database, friendTable: FriendTable) {
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
			CHECK(fromId != toId));`
		)
		
		this.db = db
		this.friendTable = friendTable

		this.insertFriendRequest = db.prepare(`INSERT INTO friendRequest 
			(fromId, toId)
			VALUES (:fromId, :toId)
			RETURNING *;`
		)
		this.updateFriendRequest = db.prepare(`UPDATE friendRequest
			SET status = :status
			WHERE id = :id
			RETURNING *;`
		)
		this.selectFriendRequest = db.prepare(`SELECT * FROM friendRequest WHERE id = :id;`)

		this.selectFriendRequests = db.prepare(`SELECT * FROM friendrequest 
			WHERE fromId = :identityId 
			AND status = 'requested'
			UNION
			SELECT * 
			FROM friendRequest
			WHERE toId = :identityId
			AND status = 'requested';`
		)
	}

	getFriendRequestsByIdentityId(identityId: string) {
		return this.selectFriendRequests.all<FriendRequest>({ identityId })
	}

	addFriendRequest(fromId: string, toId: string) {
		const result = this.insertFriendRequest.get<FriendRequest>({
			fromId: fromId,
			toId: toId
		})
		console.log("ADD FRIEND REQUEST", result)
		return result
	}
	
	acceptFriendRequest(id: string) {
		//const result:{request: FriendRequest|undefined, friends: Friend|undefined[]|undefined} = {friends: []}
		const updateFriendRequestTransaction = this.db.transaction(() => {
			const fr = this.selectFriendRequest.get<FriendRequest>({ id })
			if (fr === undefined) throw new Error(`no friend requst with id ${id}`)
			const requestor = this.friendTable.upsertFriend.get<Friend>({ myId: fr.fromId, friendId: fr.toId })
			const requestee = this.friendTable.upsertFriend.get<Friend>({ myId: fr.toId, friendId: fr.fromId })
			const request = this.updateFriendRequest.get<FriendRequest>({ id, status: 'accepted' })
	
			return { request, requestor, requestee }
		})
		console.log("ACCEPT FRIEND REQUEST", id)
		return updateFriendRequestTransaction()
	}
}