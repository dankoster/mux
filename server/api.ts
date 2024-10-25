import { Request } from "https://jsr.io/@oak/oak/17.0.0/request.ts";
import { Router } from "jsr:@oak/oak@17/router";
import { decodeTime, monotonicUlid } from "jsr:@std/ulid";

export { api }

export type AuthTokenName = "Authorization"
export type ApiRoute = "sse"
	| "becomeAnonymous"
	| "setColor"
	| "setText"
	| "clear"
	| "log"
	| "discardKey"
	| "webRTC"
	| "room"
	| "room/join"

//is there a way to have the RoomRoute be nested under ApiRoute
// like this { setColor: "setColor", room: { join: "room/join"}}
// type FullApi = { 
// 	[Property in ApiRoute | RoomRoute]: 
// 	Property extends RoomRoute ? `room/${Property}` : Property 
// }

export type SSEvent = "pk"
	| "id"
	| "serverId"
	| "webRTC"
	| "connections"
	| "new_connection"
	| "rooms"
	| "new_room"
	| "delete_connection"
	| "delete_room"
	| "update"
	| "reconnect"

export type Room = {
	id: string,
	ownerId: string
}

export type Identity = {
	source?: string,
	id?: string,
	name?: string,
	avatar_url?: string
}

export type Connection = {
	id: string,
	color?: string,
	text?: string,
	status?: string,
	roomId?: string,
	identity?: Identity
}

type ConnectionLog = {
	kind: 'returning' | 'new',
	connectionId: string,
	os?: string,
	ip?: string,
	name?: string,
}

export type Update = {
	connectionId: string,
	field: keyof Connection,
	value: string
}

const sseEvent: { [Property in SSEvent]: Property } = {
	pk: "pk",
	id: "id",
	serverId: "serverId",
	webRTC: "webRTC",
	rooms: "rooms",
	connections: "connections",
	reconnect: "reconnect",
	new_connection: "new_connection",
	delete_connection: "delete_connection",
	update: "update",
	new_room: "new_room",
	delete_room: "delete_room",
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
	log: "log"
}

const KV_KEYS = {
	//rooms: ['rooms'],
	roomPrefix: ['room'],
	roomChangeFlag: ['roomChangeFlag'],
	room: (uuid: string) => [...KV_KEYS.roomPrefix, uuid],

	newConnectionFlag: ['newConnectionFlag'],
	connectionPrefix: ['connection'],
	connection: (uuid: string) => [...KV_KEYS.connectionPrefix, uuid],

	messageFlag: (conUUID: string) => ['messageFlag', conUUID],
	messagePrefix: ['message'],
	message: (conUUID: string) => [...KV_KEYS.messagePrefix, conUUID],
	newMessage: (conUUID: string) => [...KV_KEYS.message(conUUID), monotonicUlid()]
}


const serverID = Date.now()
const kv = await Deno.openKv();


// await kv.delete(KV_KEYS.connections)
// await kv.delete(KV_KEYS.rooms)

////DELETE LOGS
// const entries = kv.list<string>({ prefix: ["log"] })
// for await (const entry of entries) {
// 	await kv.delete(entry.key)
// }

type QueuedSSEEvent = { event: SSEvent, value: string }

const updateFunctionByUUID = new Map<string, {
	isLocal: boolean,
	update: (event: SSEvent, value?: string) => void,
}>()

//server is starting up... get rooms list
const roomByUUID = await InitRooms()
async function InitRooms() {
	const rooms = new Map<string, Room>()
	const kv_rooms = kv.list<Room>({ prefix: KV_KEYS.roomPrefix });
	for await (const kv_room of kv_rooms) {
		const uuid = kv_room.key[1] as string
		const room = kv_room.value as Room
		rooms.set(uuid, room)
	}

	watchForRoomUpdates();

	console.log(serverID, "INIT Got rooms from KV:", rooms)
	return rooms
}

async function watchForRoomUpdates() {
	console.log(serverID, 'KV watching for room changes');
	for await (const changes of kv.watch([KV_KEYS.roomChangeFlag])) {

		const kv_rooms = kv.list<Room>({ prefix: KV_KEYS.roomPrefix });
		for await (const kv_room of kv_rooms) {
			const uuid = kv_room.key[1] as string;
			const room = kv_room.value as Room;

			//add the room if we don't have it
			if (!roomByUUID.has(uuid)) {
				console.log(serverID, 'KV adding room created remoteley')
				roomByUUID.set(uuid, room);
			}

			//TODO: what about deleting rooms?
		}
	}
}


//server is starting up... get connections list
const connectionByUUID = await InitConnections()

async function InitConnections() {
	const connections = new Map<string, Connection>()
	const kv_connections = kv.list<Connection>({ prefix: KV_KEYS.connectionPrefix });
	for await (const kv_connection of kv_connections) {
		const uuid = kv_connection.key[1] as string
		const connection = kv_connection.value as Connection
		connections.set(uuid, connection)

		if (connection.status === 'online' && !updateFunctionByUUID.has(uuid)) {
			createRemoteUpdateFunction(uuid)
		}

		watchForRemoteConnectionDisconnect(kv_connection.key, uuid)
	}

	console.log(serverID, "INIT Got connections from KV:", connections)
	watchForNewConnections()
	return connections
}

async function watchForNewConnections() {
	console.log(serverID, `KV watching for new connections`)

	//KV can't watch a key prefix, you have to watch a specific key, so...
	//Watch for a flag to change, indicating that there are new connections
	//... we don't care what the actual flag is set to, just that it changed
	for await (const changes of kv.watch([KV_KEYS.newConnectionFlag])) {

		const kv_connections = kv.list<Connection>({ prefix: KV_KEYS.connectionPrefix });
		for await (const kv_connection of kv_connections) {
			const uuid = kv_connection.key[1] as string
			const connection = kv_connection.value as Connection

			if (!connectionByUUID.has(uuid)) {
				console.log(serverID, 'KV Got new connection', connection)
				connectionByUUID.set(uuid, connection)
				if (connection.status === 'online' && !updateFunctionByUUID.has(uuid)) {
					createRemoteUpdateFunction(uuid);
				}

				notifyAllConnections(sseEvent.new_connection, connection, { excludeUUID: uuid })
				watchForRemoteConnectionDisconnect(kv_connection.key, uuid)
			}
		}

	}
}

function createRemoteUpdateFunction(uuid: string) {
	updateFunctionByUUID.set(uuid, {
		isLocal: false,
		update: async (event, value) => {
			console.log(serverID, 'KV sending message', { event, value });
			await kv.set(KV_KEYS.message(uuid), { event, value }); //enqueue the message
			await kv.set(KV_KEYS.messageFlag(uuid), monotonicUlid()); //signal that there is a new message.
		}
	});
	console.log(serverID, 'KV set remote update function for', uuid, updateFunctionByUUID.get(uuid));
}

async function watchForRemoteConnectionDisconnect(key: Deno.KvKey, uuid: string) {
	//watch for changes to this connection
	console.log(serverID, 'KV watching for updates', uuid)
	const stream = kv.watch([key]);
	for await (const update of stream) {
		// console.log(serverID, "KV connection updated", update[0])
		const connection = update[0].value as Connection
		connectionByUUID.set(uuid, connection)

		//remove update function when connection goes offline
		if (connection && connection?.status !== 'online' && updateFunctionByUUID.has(uuid)) {
			const updater = updateFunctionByUUID.get(uuid)
			if (!updater?.isLocal) {
				updateFunctionByUUID.delete(uuid)
				console.log(serverID, 'KV remove update function for', uuid)
			}
		}
	}
}

async function watchForMessages(uuid: string) {
	console.log(serverID, `KV watching cross-server messages for ${uuid}...`)

	//KV can't watch a key prefix, you have to watch a specific key, so...
	//Watch for a message flag to change, indicating that there are new messages for this UUID
	//... we don't care what the actual flag is set to, just that it changed
	for await (const changes of kv.watch([KV_KEYS.messageFlag(uuid)])) {
		//get all of the messages for this UUID (they will have keys like ['message', UUID, ULID])
		const messageList = kv.list<QueuedSSEEvent>({ prefix: KV_KEYS.message(uuid) })
		for await (const message of messageList) {
			console.log(serverID, `KV got message`, message)
			const fn = updateFunctionByUUID.get(uuid)?.update
			if (fn) {
				const sseMessage = message.value
				fn(sseMessage.event, sseMessage.value)
				await kv.delete(message.key) //we processed this message. Remove it from KV
				console.log(serverID, 'KV deleted message', message.key)
			}
			else console.log(serverID, 'KV no update function for', uuid)
		}
	}
}

// function cleanupRooms() {
// 	let modified = false
// 	rooms.forEach(room => {
// 		const ownerUUID = getUUID(room.ownerId)
// 		if (!ownerUUID) {
// 			console.log(serverID, 'cleanupRooms removed room because no owner found!', room)
// 			rooms.splice(rooms.indexOf(room), 1)
// 			updateFunctionByUUID.forEach(fn => fn.update(sseEvent.delete_room, JSON.stringify(room)))
// 			modified = true
// 			return
// 		}
// 		const owner = connectionByUUID.get(ownerUUID)
// 		if (owner?.roomId !== room.id) {
// 			console.log(serverID, 'cleanupRooms removed room because owner not in room!', room)
// 			rooms.splice(rooms.indexOf(room), 1)
// 			updateFunctionByUUID.forEach(fn => fn.update(sseEvent.delete_room, JSON.stringify(room)))
// 			modified = true
// 		}
// 	})

// 	if (modified) kv.set(KV_KEYS.rooms, rooms)
// }

export function validateConnectionByUUID(uuid: string) {
	return connectionByUUID.has(uuid)
}
export async function addConnectionIdentity(uuid: string, identity: Identity) {
	const con = connectionByUUID.get(uuid)
	if (!con) throw new Error(`connection not found for uuid ${uuid}`)
	con.identity = identity
	const result = await kv.set(KV_KEYS.connection(uuid), con)
	if (!result.ok) throw new Error('error updating connection identity')
	console.log(serverID, "addConnectionIdentity", con)
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
			console.log(serverID, event.toUpperCase(), uuidToUpdate, update)
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

function updateConnectionProperty(req: Request, field: keyof Connection, value?: string): Update {
	const uuid = req.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);
	const con = connectionByUUID.get(uuid);
	if (!con) throw new Error(`No connection found for key ${uuid}`);
	if (value) con[field] = value
	else delete con[field]
	return { connectionId: con.id, field, value: value ?? "" }
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
	console.log(serverID, "deleteRoom: kick all users!")
	connectionByUUID.forEach((connection, uuid) => {
		if (connection.roomId === room.id) {
			delete connection.roomId;
			notifyAllConnections(sseEvent.update, {
				connectionId: connection.id,
				field: "roomId",
				value: ""
			});

			kv.set(KV_KEYS.connection(uuid), connection)
		}
	});

	roomByUUID.delete(room.id)
	kv.delete(KV_KEYS.room(room.id))
	kv.set(KV_KEYS.roomChangeFlag, monotonicUlid())

	notifyAllConnections(sseEvent.delete_room, room)
}

const api = new Router();

//we just need to relay webRTC signaling messages between users so they can
//negotiate their own peer-to-peer connection. We don't care about
//the actual conent of the messages, only that they are properly routed.
//https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
api.post(`/${apiRoute.webRTC}/:userId`, async (ctx) => {
	console.log(serverID, ctx.request.method.toUpperCase(), ctx.request.url.pathname, ctx.params.userId)
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
	console.log(serverID, "[JOIN ROOM] POST", apiRoute.room.toUpperCase(), roomId)
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
	notifyAllConnections(sseEvent.update, {
		connectionId: con.id,
		field: "roomId",
		value: room.id
	})

	//update KV connection
	await kv.set(KV_KEYS.connection(uuid), con)

	ctx.response.status = 200
})

//Create a room
api.post(`/${apiRoute.room}`, async (ctx) => {

	console.log(serverID, "POST", apiRoute.room.toUpperCase())
	const uuid = ctx.request.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);

	const con = connectionByUUID.get(uuid)
	if (!con) throw new Error(`${uuid} not found in ${[...connectionByUUID.keys()]}`)

	const room: Room = {
		id: crypto.randomUUID(),
		ownerId: con.id,
	}

	con.roomId = room.id
	roomByUUID.set(room.id, room)

	await Promise.all([
		kv.set(KV_KEYS.room(room.id), room),
		kv.set(KV_KEYS.roomChangeFlag, monotonicUlid()),
		kv.set(KV_KEYS.connection(uuid), con),
	])

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
	console.log(serverID, "DELETE", apiRoute.room.toUpperCase(), ctx.params)
	const uuid = ctx.request.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);

	const con = connectionByUUID.get(uuid)
	if (!con) {
		ctx.response.status = 401 //unauthenticated
		return
	}

	//remove the room reference regardless (we're leaving the room)
	delete con.roomId
	kv.set(KV_KEYS.connection(uuid), con)
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
	console.log(serverID, "CLEAR", oldData, roomByUUID)
	ctx.response.body = oldData

	//delete all data
	const entries = kv.list<string>({ prefix: KV_KEYS.connectionPrefix })
	for await (const entry of entries) {
		await kv.delete(entry.key)
	}

	const rooms = kv.list({ prefix: KV_KEYS.roomPrefix })
	for await (const room of rooms) {
		kv.delete(room.key)
	}

	//reinit with empty everything
	connectionByUUID.clear()
	roomByUUID.clear()

	//tell all clients to reconnect
	updateFunctionByUUID.forEach(updater => updater.update(sseEvent.reconnect))
})

api.get(`/${apiRoute.log}/:key`, async (ctx) => {

	//do we have the correct bearer token for this?
	const KV_LOG_KEY = Deno.env.get("KV_LOG_KEY")
	if (!KV_LOG_KEY || ctx.params.key !== KV_LOG_KEY) {
		ctx.response.status = 401 //unauthorized
		return
	}

	const result: string[] = []
	const entries = kv.list<ConnectionLog>({ prefix: ["log", "connection"] }, {
		reverse: true,
		limit: 100,
	});
	for await (const entry of entries) {
		const timestamp = new Date(decodeTime(entry.key[2].toString()));
		const data = entry.value;
		result.push([
			timestamp.toISOString(),
			data.ip,
			data.connectionId?.substring(data.connectionId.length - 11),
			data.kind,
			data.os,
			(data.name && `[${data.name}]`) || "Anonymous",
		].join(' '))
	}

	ctx.response.body = result.join('\r\n')
})


api.post(`/${apiRoute.becomeAnonymous}`, async (context) => {
	// console.log(serverID, context.request.method.toUpperCase(), context.request.url.pathname)
	try {
		const update = updateConnectionProperty(context.request, "identity")
		notifyAllConnections(sseEvent.update, update)
		context.response.status = 200
	} catch (err) {
		console.error(err, context.request)
		context.response.status = 400
	}
})

api.post(`/${apiRoute.setText}`, async (context) => {
	try {
		const text = await context.request.body.text()
		if (text.length > 123)
			throw new Error("invalid text")

		const update = updateConnectionProperty(context.request, "text", text)
		notifyAllConnections(sseEvent.update, update)
		context.response.status = 200
	} catch (err) {
		console.error(err, context.request)
		context.response.status = 400
	}
})

api.post(`/${apiRoute.setColor}`, async (context) => {
	try {
		const color = await context.request.body.text()
		if (!color.startsWith("#") || color.length > 9)
			throw new Error("invalid color")

		const update = updateConnectionProperty(context.request, "color", color)
		notifyAllConnections(sseEvent.update, update)
		context.response.status = 200
	} catch (err) {
		console.error(err, context.request)
		context.response.status = 400
	}
});

api.get(`/${apiRoute.sse}`, async (context) => {
	//https://deno.com/blog/deploy-streams
	//get the user's bearer token or create a new one
	const oldKey = context.request.headers.get(AUTH_TOKEN_HEADER_NAME)
	const uuid = oldKey ?? crypto.randomUUID()

	const old = connectionByUUID.has(uuid)
	console.log(serverID, "SSE", `Connect (${old ? "old" : "new"})`, uuid, context.request.ip, context.request.userAgent.os.name)

	//let connection = connectionByUUID.get(uuid)
	const kvConnection = await kv.get<Connection>(KV_KEYS.connection(uuid))
	let connection = kvConnection.value

	//retain a log of some connection details (don't wait for it to complete)
	try {
		kv.set(['log', 'connection', monotonicUlid()], {
			kind: old ? "returning" : "new",
			connectionId: uuid,
			os: context.request.userAgent.os.name,
			ip: context.request.ip,
			name: connection?.identity?.name,
			serverID
		} as ConnectionLog)
	} catch (error) {
		console.warn('FAILED TO LOG', error)
	}

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

			const result = await kv.set(KV_KEYS.connection(uuid), connection)
			console.log(serverID, 'KV set connection', uuid, connection, result)

			updateFunctionByUUID.set(uuid, {
				isLocal: true, update: (event, value) => {
					try {
						controller.enqueue(sseMessage(event, value))
					} catch (error) {
						console.error(uuid, error)
					}
				}
			})
			console.log(serverID, 'SSE set update function for', uuid, updateFunctionByUUID.get(uuid))

			watchForMessages(uuid)

			console.log(serverID, "SSE connection   ", uuid, connection)
			controller.enqueue(sseMessage(sseEvent.id, connection.id))
			controller.enqueue(sseMessage(sseEvent.pk, uuid))
			controller.enqueue(sseMessage(sseEvent.serverId, serverID?.toString()))
			controller.enqueue(sseMessage(sseEvent.connections, JSON.stringify(Array.from(connectionByUUID.values()))))
			controller.enqueue(sseMessage(sseEvent.rooms, JSON.stringify(Array.from(roomByUUID.values()))))

			if (isNewConnection) {
				await kv.set(KV_KEYS.newConnectionFlag, monotonicUlid())
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
					console.log(serverID, 'owner disconnected from room', room.id)
					deleteRoom(room)
				}

				//we're also leaving the room
				delete connection.roomId
				notifyAllConnections(sseEvent.update, {
					connectionId: connection.id,
					field: "roomId",
					value: ""
				})
			}

			console.log(serverID, "SSE Disconnect   ", uuid, connection)
			connection.status = ""

			kv.set(KV_KEYS.connection(uuid), connection)

			notifyAllConnections(sseEvent.update, {
				connectionId: connection.id,
				field: "status",
				value: ""
			})
		}
	});
});
