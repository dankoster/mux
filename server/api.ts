import { Request } from "jsr:@oak/oak@17/request";
import { Router } from "jsr:@oak/oak@17/router";
import * as db from "./db.ts";
import type { SSEvent, AuthTokenName, ApiRoute, Room, Connection, Identity, Update } from "./types.ts";
import { onLocalBuild } from "./localHelper.ts";

export { api }

const sseEvent: { [Property in SSEvent]: Property } = {
	pk: "pk",
	id: "id",
	webRTC: "webRTC",
	rooms: "rooms",
	connections: "connections",
	refresh: "refresh",
	reconnect: "reconnect",
	new_connection: "new_connection",
	delete_connection: "delete_connection",
	update: "update",
	new_room: "new_room",
	delete_room: "delete_room",
	friendRequest: "friendRequest",
	friendList: "friendList",
	friendRequests: "friendRequests",
	friendRequestAccepted: "friendRequestAccepted"
}

const AUTH_TOKEN_HEADER_NAME: AuthTokenName = "Authorization"

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	setColor: "setColor",
	setText: "setText",
	clear: "clear",
	discardKey: "discardKey",
	webRTC: "webRTC",
	room: "room",
	"room/join": "room/join",
	becomeAnonymous: "becomeAnonymous",
	log: "log",
	friendRequest: "friendRequest",
	acceptFriendRequest: "acceptFriendRequest"
}

const updateFunctionByUUID = new Map<string, {
	isLocal: boolean,
	update: (event: SSEvent, value?: string) => void,
}>()



//server is starting up... cleanup and then get persisted data
db.serverInitAndCleanup()
const roomByUUID = db.getRoomsByUUID() ?? new Map<string, Room>()
const connectionByUUID = db.getConnectionsByUUID() ?? new Map<string, Connection>()

console.log('got rooms', roomByUUID)
console.log('got connections', connectionByUUID)

if (Deno.env.get('ENVIRONMENT') === 'local') {
	console.log('LOCAL BUILD watching for frontend changes...')
	onLocalBuild('./dist', () => {
		console.log('LOCAL BUILD! Tell all connections to refresh...')
		//tell all connections to reload the page
		updateFunctionByUUID.forEach(updater => updater.update(sseEvent.refresh))
	})
}

db.log({ action: 'INIT', note: `${connectionByUUID.size} connections, ${roomByUUID.size} rooms` })

export function validateConnectionByUUID(uuid: string) {
	return connectionByUUID.has(uuid)
}
export async function addConnectionIdentity(uuid: string, identity: Identity) {
	const con = connectionByUUID.get(uuid)
	if (!con) throw new Error(`connection not found for uuid ${uuid}`)
	con.identity = identity

	console.log("addConnectionIdentity", con)
	const result = db.persistConnection(uuid, con)
	db.log({ action: "addConnectionIdentity", uuid, identityId: result?.identity?.id })

	notifyAllConnections(sseEvent.update, {
		connectionId: con.id,
		field: "identity",
		value: JSON.stringify(con.identity)
	})
}

function sseMessage(event: SSEvent, data?: string, id?: string) {
	//https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
	const lines = [];
	if (event) lines.push(`event: ${event}`);
	if (id) lines.push(`id: ${id}`);
	if (data) lines.push(`data: ${data}`);
	lines.push('\r\n');
	const msg = lines.join('\r\n');
	return new TextEncoder().encode(msg);
}

function notifyAllConnections(event: SSEvent, update: Update | Room | Connection, options?: { excludeUUID?: string }) {
	updateFunctionByUUID.forEach((fn, uuidToUpdate) => {
		if (!options?.excludeUUID || options?.excludeUUID !== uuidToUpdate) {
			console.log(event.toUpperCase(), uuidToUpdate, update)
			fn.update(event, JSON.stringify(update))
		}
	})
}

function getUUID(connectionId: string) {
	for (const [uuid, con] of connectionByUUID.entries()) {
		if (con.id === connectionId)
			return uuid
	}
}

function getConnection(req: Request) {
	const uuid = req.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);
	const con = connectionByUUID.get(uuid);
	if (!con) throw new Error(`No connection found for key ${uuid}`);
	return { uuid, con };
}


function getConnectionById(id: string) {
	let requestee: Connection | undefined;
	for (const c of connectionByUUID.values()) {
		if (c.id === id) {
			requestee = c;
			break;
		}
	}
	return requestee;
}

function objectFrom<V>(map: Map<string, V>) {
	const obj: { [key: string]: V } = {};
	for (const [key, val] of map) {
		obj[key] = val;
	}
	return obj;
}

function deleteRoom(room: Room) {
	//kick all users from the room
	console.log("deleteRoom: kick all users!")
	connectionByUUID.forEach((con, uuid) => {
		if (con.roomId === room.id) {
			delete con.roomId;
			db.persistConnection(uuid, con)
			notifyAllConnections(sseEvent.update, {
				connectionId: con.id,
				field: "roomId",
				value: ""
			});
		}
	});

	db.deleteRoom(room)
	roomByUUID.delete(room.id)
	notifyAllConnections(sseEvent.delete_room, room)
}

function event(req: Request) {
	return `${req.method} ${req.url.pathname}`.toUpperCase()
}

const api = new Router();

//we just need to relay webRTC signaling messages between users so they can
//negotiate their own peer-to-peer connection. We don't care about
//the actual conent of the messages, only that they are properly routed.
//https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
api.post(`/${apiRoute.webRTC}/:userId`, async (ctx) => {
	console.log(event(ctx.request), ctx.params.userId)
	const uuid = ctx.request.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);

	const sender = connectionByUUID.get(uuid)
	if (!sender) {
		ctx.response.status = 401 //unauthenticated
		return
	}

	const message = await ctx.request.body.text()
	if (!message) {
		ctx.response.status = 400 //bad request
		return
	}

	const recipientUUID = getUUID(ctx.params.userId)
	if (!recipientUUID) {
		ctx.response.status = 404 //can't find the target connection
		return
	}

	updateFunctionByUUID.get(recipientUUID)?.update.call(this, sseEvent.webRTC, JSON.stringify({
		senderId: sender.id,
		message
	}))
	ctx.response.status = 200 //success!
})

//Join room by id
api.post(`/${apiRoute["room/join"]}/:id`, async (ctx) => {
	const roomId = ctx.params.id
	console.log("[JOIN ROOM] POST", apiRoute.room.toUpperCase(), roomId)
	const uuid = ctx.request.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);

	const con = connectionByUUID.get(uuid)
	if (!con) {
		ctx.response.status = 401 //unauthenticated
		return
	}

	const room = roomByUUID.get(roomId)
	if (!room) {
		ctx.response.status = 404
		return
	}

	con.roomId = room?.id
	db.persistConnection(uuid, con)
	db.log({ action: event(ctx.request), uuid, identityId: con.identity?.id, roomId: room.id })
	notifyAllConnections(sseEvent.update, {
		connectionId: con.id,
		field: "roomId",
		value: room.id
	})

	ctx.response.status = 200
})

//Create a room
api.post(`/${apiRoute.room}`, async (ctx) => {

	console.log("POST", apiRoute.room.toUpperCase())
	const uuid = ctx.request.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);

	const con = connectionByUUID.get(uuid)
	if (!con) throw new Error(`${uuid} not found in ${[...connectionByUUID.keys()]}`)

	const room: Room = {
		id: crypto.randomUUID(),
		ownerId: con.id,
	}

	con.roomId = room.id
	db.persistRoom(room)
	db.log({ action: event(ctx.request), uuid, identityId: con.identity?.id, roomId: room.id })
	roomByUUID.set(room.id, room)

	db.persistConnection(uuid, con)
	notifyAllConnections(sseEvent.new_room, room)
	notifyAllConnections(sseEvent.update, {
		connectionId: con.id,
		field: "roomId",
		value: room.id
	})

	ctx.response.body = JSON.stringify(room)
})

//exit room (the room is deleted if the owner leaves)
api.delete(`/${apiRoute.room}/:id`, async (ctx) => {
	console.log("DELETE", apiRoute.room.toUpperCase(), ctx.params)
	const uuid = ctx.request.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);

	const con = connectionByUUID.get(uuid)
	if (!con) {
		ctx.response.status = 401 //unauthenticated
		return
	}

	//remove the room reference regardless (we're leaving the room)
	db.log({ action: event(ctx.request), uuid, identityId: con.identity?.id, roomId: con.roomId })
	delete con.roomId
	db.persistConnection(uuid, con)
	notifyAllConnections(sseEvent.update, {
		connectionId: con.id,
		field: "roomId",
		value: ""
	})
	ctx.response.status = 200 //but we did successfully leave the room

	//are we the owner? Nuke it!
	const room = roomByUUID.get(ctx.params.id)
	if (room && room.ownerId == con.id) {
		deleteRoom(room);
		ctx.response.body = room
		ctx.response.status = 200
	}
})

//Get room by id
api.get(`/${apiRoute.room}/:id`, async (ctx) => {
	const uuid = ctx.request.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);

	const con = connectionByUUID.get(uuid)
	if (!con) {
		ctx.response.status = 401 //unauthenticated
		return
	}

	ctx.response.body = roomByUUID.get(ctx.params.id)
})

//nuke it from orbit
api.post(`/${apiRoute.clear}/:key`, async (ctx) => {
	//do we have the correct bearer token for this?
	if (ctx.params.key !== Deno.env.get("KV_CLEAR_KEY")) {
		ctx.response.status = 401 //unauthorized
		return
	}

	//here's what we're deleting...
	const oldData = objectFrom(connectionByUUID);
	console.log("CLEAR", oldData, roomByUUID)
	ctx.response.body = oldData

	roomByUUID.forEach(room => db.deleteRoom(room))
	connectionByUUID.forEach((con, uuid) => db.deleteConnection(uuid))
	db.log({ action: event(ctx.request), note: 'key:' + ctx.params.key })

	//reinit with empty everything
	connectionByUUID.clear()
	roomByUUID.clear()

	//tell all clients to reconnect
	updateFunctionByUUID.forEach(updater => updater.update(sseEvent.reconnect))
})

api.post(`/${apiRoute.friendRequest}`, async (ctx) => {
	const { uuid, con: requestor } = getConnection(ctx.request);
	db.log({ action: event(ctx.request), uuid, identityId: requestor.identity?.id })

	const requesteeId = await ctx.request.body.text()
	let requestee = getConnectionById(requesteeId);
	const requesteeUuid = getUUID(requesteeId)

	if (!requestee || !requesteeUuid) {
		ctx.response.status = 404
		return
	}

	if (!requestor.identity?.id || !requestee.identity?.id) {
		ctx.response.status = 405 //not allowed
		ctx.response.body = 'both parties must be identified'
		return
	}

	const friendRequest = db.addFriendRequest(requestor.identity?.id, requestee.identity?.id)
	if (!friendRequest) {
		ctx.response.status = 500
		return
	}

	updateFunctionByUUID.get(uuid)?.update(sseEvent.friendRequest, JSON.stringify(friendRequest))
	updateFunctionByUUID.get(requesteeUuid)?.update(sseEvent.friendRequest, JSON.stringify(friendRequest))
	ctx.response.body = friendRequest
})

api.post(`/${apiRoute.acceptFriendRequest}`, async (ctx) => {
	const { uuid: requesteeUuid, con } = getConnection(ctx.request);
	const friendRequestId = await ctx.request.body.text()

	db.log({ action: event(ctx.request), uuid: requesteeUuid, identityId: con.identity?.id, note: friendRequestId })

	if (!friendRequestId) throw new Error(`friend request id ${friendRequestId} not found`)

	const result = db.acceptFriendRequest(friendRequestId)

	//get the uuid of the requestor
	let requestorUuid
	for (const [uuid, con] of connectionByUUID.entries()) {
		if (con.identity?.id === result.requestor?.myId) {
			requestorUuid = uuid
			break;
		}
	}

	if (!requestorUuid) throw new Error(`requestorUuid not found for friend request ${friendRequestId}`)

	console.log("ACCEPT FRIEND REQUEST", `${result.requestee?.myId} accepted request from ${result.requestor?.myId}`)

	updateFunctionByUUID.get(requesteeUuid)?.update(sseEvent.friendRequestAccepted, JSON.stringify(result.requestee))
	updateFunctionByUUID.get(requestorUuid)?.update(sseEvent.friendRequestAccepted, JSON.stringify(result.requestor))
	ctx.response.status = 200
})



api.post(`/${apiRoute.becomeAnonymous}`, async (ctx) => {
	try {
		const { uuid, con } = getConnection(ctx.request);
		db.log({ action: event(ctx.request), uuid, identityId: con.identity?.id })
		delete con.identity
		db.persistConnection(uuid, con)
		notifyAllConnections(sseEvent.update, {
			connectionId: con.id,
			field: "identity",
			value: "",
		})
		ctx.response.status = 200
	} catch (err) {
		console.error(err, ctx.request)
		ctx.response.status = 400
	}
})

api.post(`/${apiRoute.setText}`, async (ctx) => {
	try {
		const text = await ctx.request.body.text()
		if (text.length > 123)
			throw new Error("invalid text")

		const { uuid, con } = getConnection(ctx.request)
		con.text = text
		db.persistConnection(uuid, con)
		db.log({ action: event(ctx.request), uuid, identityId: con.identity?.id, roomId: con.roomId })
		notifyAllConnections(sseEvent.update, {
			connectionId: con.id,
			field: 'text',
			value: text
		})
		ctx.response.status = 200
	} catch (err) {
		console.error(err, ctx.request)
		ctx.response.status = 400
	}
})

api.post(`/${apiRoute.setColor}`, async (ctx) => {
	try {
		const color = await ctx.request.body.text()
		if (!color.startsWith("#") || color.length > 9)
			throw new Error("invalid color")

		const { uuid, con } = getConnection(ctx.request)
		con.color = color
		db.persistConnection(uuid, con)
		db.log({ action: event(ctx.request), uuid, identityId: con.identity?.id, roomId: con.roomId })
		notifyAllConnections(sseEvent.update, {
			connectionId: con.id,
			field: 'color',
			value: color
		})
		ctx.response.status = 200
	} catch (err) {
		console.error(err, ctx.request)
		ctx.response.status = 400
	}
});

api.get(`/${apiRoute.sse}`, async (context) => {
	//https://deno.com/blog/deploy-streams
	//get the user's bearer token or create a new one
	const oldKey = context.request.headers.get(AUTH_TOKEN_HEADER_NAME)
	const uuid = oldKey ?? crypto.randomUUID()

	const old = connectionByUUID.has(uuid)
	console.log("SSE", `Connect (${old ? "old" : "new"})`, uuid, context.request.ip, context.request.userAgent.os.name)
	let connection = connectionByUUID.get(uuid)

	context.response.headers.append("Content-Type", "text/event-stream");
	context.response.body = new ReadableStream({
		async start(controller) {
			let isNewConnection = false
			if (!connection) {
				connection = {
					id: Date.now().toString(),
					status: "online"
				}
				connectionByUUID.set(uuid, connection)
				isNewConnection = true
			}

			connection.status = "online"
			connection.kind = context.request.userAgent.os.name

			db.persistConnection(uuid, connection)
			db.log({
				action: event(context.request),
				uuid,
				identityId: connection?.identity?.id,
				ip: context.request.ip,
				userAgent: context.request.userAgent.os.name,
				note: `CONNECT (${old ? "known" : "new"})`
			})


			updateFunctionByUUID.set(uuid, {
				isLocal: true, update: (event, value) => {
					try {
						controller.enqueue(sseMessage(event, value))
					} catch (error) {
						console.error(uuid, error)
					}
				}
			})

			//The user has connected!  Send them a bunch of stuff!
			console.log("SSE connection   ", uuid, connection)
			controller.enqueue(sseMessage(sseEvent.id, connection.id))
			controller.enqueue(sseMessage(sseEvent.pk, uuid))
			controller.enqueue(sseMessage(sseEvent.connections, JSON.stringify(Array.from(connectionByUUID.values()))))
			controller.enqueue(sseMessage(sseEvent.rooms, JSON.stringify(Array.from(roomByUUID.values()))))

			if (connection.identity?.id) {
				const friends = db.getFriendsByIdentityId(connection.identity?.id)
				controller.enqueue(sseMessage(sseEvent.friendList, JSON.stringify(friends)))

				const friendRequests = db.getFriendRequestsByIdentityId(connection.identity?.id)
				controller.enqueue(sseMessage(sseEvent.friendRequests, JSON.stringify(friendRequests)))
			}

			if (isNewConnection) {
				notifyAllConnections(sseEvent.new_connection, connection, { excludeUUID: uuid })
			}

			notifyAllConnections(sseEvent.update, {
				connectionId: connection.id,
				field: "status",
				value: connection.status
			})
		},
		//https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/cancel
		cancel() {
			//SSE connection has closed...
			updateFunctionByUUID.delete(uuid)

			const connection = connectionByUUID.get(uuid)
			if (!connection)
				throw new Error(`orphan disconnected! ${uuid}}`)

			//are we disconnecting while we have a room open?
			if (connection.roomId) {
				const room = roomByUUID.get(connection.roomId)

				//do we own the room? Nuke it!
				if (room && room.ownerId === connection.id) {
					console.log('owner disconnected from room', room.id)
					deleteRoom(room)
				}

				//we're also leaving the room
				delete connection.roomId
				db.persistConnection(uuid, connection)
				db.log({
					action: event(context.request),
					uuid,
					identityId: connection?.identity?.id,
					ip: context.request.ip,
					userAgent: context.request.userAgent.toString(),
					note: `DISCONNECT`
				})
				notifyAllConnections(sseEvent.update, {
					connectionId: connection.id,
					field: "roomId",
					value: ""
				})
			}

			console.log("SSE Disconnect   ", uuid, connection)
			connection.status = ""

			notifyAllConnections(sseEvent.update, {
				connectionId: connection.id,
				field: "status",
				value: ""
			})
		}
	});
});
