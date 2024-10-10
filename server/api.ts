import { Context, Status } from "jsr:@oak/oak@17";
import { Request } from "https://jsr.io/@oak/oak/17.0.0/request.ts";
import { Router } from "jsr:@oak/oak@17/router";

export { api }

export type AuthTokenName = "Authorization"
export type ApiRoute = "sse"
	| "setColor"
	| "setText"
	| "clear"
	| "discardKey"
	| "dm"
	| "room"
	| `room/${RoomRoute}`

export type RoomRoute = "join"
	| "offerSessionDescription"
	| "answerSessionDescription"
	| "answerCall"
	| "addOfferCandidate"
	| "addAnswerCandidate"

//is there a way to have the RoomRoute be nested under ApiRoute
// like this { setColor: "setColor", room: { join: "room/join"}}
// type FullApi = { 
// 	[Property in ApiRoute | RoomRoute]: 
// 	Property extends RoomRoute ? `room/${Property}` : Property 
// }

export type SSEvent = "pk"
	| "id"
	| "dm"
	| "connections"
	| "new_connection"
	| "rooms"
	| "room_sessionDescriptionAdded"
	| "room_answerCandidateAdded"
	| "room_offerCandidateAdded"
	| "room_remoteAnswered"
	| "new_room"
	| "delete_connection"
	| "delete_room"
	| "update"
	| "reconnect"

export type Room = {
	id: string,
	ownerId: string
}

export type Connection = {
	id: string,
	color?: string,
	text?: string,
	status?: string,
	roomId?: string,
}

export type Update = {
	connectionId: string,
	field: keyof Connection,
	value: string
}

const sseEvent: { [Property in SSEvent]: Property } = {
	pk: "pk",
	id: "id",
	dm: "dm",
	rooms: "rooms",
	connections: "connections",
	reconnect: "reconnect",
	new_connection: "new_connection",
	delete_connection: "delete_connection",
	update: "update",
	new_room: "new_room",
	delete_room: "delete_room",
	room_sessionDescriptionAdded: "room_sessionDescriptionAdded",
	room_offerCandidateAdded: "room_offerCandidateAdded",
	room_answerCandidateAdded: "room_answerCandidateAdded",
	room_remoteAnswered: "room_remoteAnswered",
}

const AUTH_TOKEN_HEADER_NAME: AuthTokenName = "Authorization"

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	setColor: "setColor",
	setText: "setText",
	clear: "clear",
	discardKey: "discardKey",
	dm: "dm",

	room: "room",
	"room/join": "room/join",
	"room/addOfferCandidate": "room/addOfferCandidate",
	"room/answerCall": "room/answerCall",
	"room/addAnswerCandidate": "room/addAnswerCandidate",
	"room/offerSessionDescription": "room/offerSessionDescription",
	"room/answerSessionDescription": "room/answerSessionDescription",
}

const KV_KEYS = {
	rooms: ['rooms'],
	connections: ['connections'],
}

const kv = await Deno.openKv();


// await kv.delete(KV_KEYS.connections)
// await kv.delete(KV_KEYS.rooms)


const result = await kv.get<Map<string, Connection>>(KV_KEYS.connections)
const connectionByUUID = result.value ?? new Map<string, Connection>()
connectionByUUID.forEach(con => {
	if (con.status === 'online')
		con.status = 'suspect'
})

//webRTC
type webRtcSession = {
	sdp: string,
	answerSdp: string,
	offerCandidates?: string[],
	answerCandidates?: string[],
}
const rooms = (await kv.get<Room[]>(KV_KEYS.rooms)).value ?? [] as Room[]
cleanupRooms()
function cleanupRooms() {
	let modified = false
	rooms.forEach(room => {
		const ownerUUID = getUUID(room.ownerId)
		if (!ownerUUID) {
			console.log('cleanupRooms removed', room)
			updateAllConnections_deleteRoom(room)
			rooms.splice(rooms.indexOf(room), 1)
			modified = true
			return
		}
		const owner = connectionByUUID.get(ownerUUID)
		if (owner?.roomId !== room.id) {
			console.log('cleanupRooms removed', room)
			updateAllConnections_deleteRoom(room)
			rooms.splice(rooms.indexOf(room), 1)
			modified = true
		}
	})

	if(modified) kv.set(KV_KEYS.rooms, rooms)
}

const webRtcSessionByRoomId = new Map<string, webRtcSession>()

const updateFunctionByUUID = new Map<string, (event: SSEvent, value?: string) => void>()
console.log("INIT Got connections from KV:", connectionByUUID)
console.log("INIT Got rooms from KV:", rooms)

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

function notifyAllConnections() {
	kv.set(KV_KEYS.connections, connectionByUUID)
	const connections = Array.from(connectionByUUID.values())
	const value = JSON.stringify(connections)
	updateFunctionByUUID.forEach(update => update(sseEvent.connections, value))
}

function updateAllConnections(update: Update) {
	console.log(sseEvent.update.toUpperCase(), update)
	kv.set(KV_KEYS.connections, connectionByUUID)
	// var updateUuid = getUUID(update.connectionId);
	updateFunctionByUUID.forEach((fn, uuid) => {
		// if (uuid !== updateUuid)
		fn(sseEvent.update, JSON.stringify(update))
	})
}

function updateAllConnections_newConnection(connection: Connection) {
	console.log(sseEvent.update.toUpperCase(), connection)
	kv.set(KV_KEYS.connections, connectionByUUID)
	var updateUuid = getUUID(connection.id);
	updateFunctionByUUID.forEach((fn, uuid) => {
		if (uuid !== updateUuid)
			fn(sseEvent.new_connection, JSON.stringify(connection))
	})
}

function updateAllConnections_newRoom(room: Room) {
	kv.set(KV_KEYS.rooms, rooms)
	console.log(sseEvent.new_room.toUpperCase(), room)
	updateFunctionByUUID.forEach((fn) =>
		fn(sseEvent.new_room, JSON.stringify(room)))
}

function updateAllConnections_deleteRoom(room: Room) {
	kv.set(KV_KEYS.rooms, rooms)
	console.log("SSE updateAllConnections_deleteRoom", sseEvent.delete_room, room)
	updateFunctionByUUID.forEach(fn =>
		fn(sseEvent.delete_room, JSON.stringify(room)))
}

function updateAllConnections_deleteConnection(connection: Connection) {
	console.log(sseEvent.update.toUpperCase(), connection)
	kv.set(KV_KEYS.connections, connectionByUUID)
	var updateUuid = getUUID(connection.id);
	updateFunctionByUUID.forEach((fn, uuid) => {
		if (uuid !== updateUuid)
			fn(sseEvent.delete_connection, connection.id)
	})
}

function getUUID(connectionId: string) {
	for (const [uuid, con] of connectionByUUID.entries()) {
		if (con.id === connectionId)
			return uuid
	}
}

function updateConnectionProperty(req: Request, field: keyof Connection, value: string): Update {
	const uuid = req.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);
	const con = connectionByUUID.get(uuid);
	if (!con) throw new Error(`No connection found for key ${uuid}`);
	con[field] = value;
	return { connectionId: con.id, field, value }
}

function objectFrom<V>(map: Map<string, V>) {
	const obj: { [key: string]: V } = {};
	for (const [key, val] of map) {
		obj[key] = val;
	}
	return obj;
}

type roomRequestInfo = {
	status: Status;
	body?: string;
	room?: Room;
	con_req?: Connection;
}
async function getRoomInfo(req: Request, { requireOwnership, requireBody = true }
	: { requireOwnership: boolean, requireBody?: boolean })
	: Promise<roomRequestInfo> {

	const result: roomRequestInfo = {
		status: 418 //teapot
	}

	//do we have a recognized bearer token?
	const uuid = req.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);
	result.con_req = connectionByUUID.get(uuid);
	if (!result.con_req) {
		result.status = 401 //unauthenticated 
		return result
	}

	if (requireBody) {
		result.body = await req.body.text()
		if (!result.body) {
			result.status = 400 //bad request
			return result
		}
	}

	//find the room claimed by this user
	result.room = rooms.find(room => room.id === result.con_req?.roomId)
	if (!result.room) {
		result.status = 404 //not found
		return result
	}

	if (requireOwnership) {
		//check for room ownership
		if (result.room?.ownerId !== result.con_req?.id) {
			result.status = 403 //forbidden
			return result
		}
	}

	return result
}

type roomNotification = { room: Room, event: SSEvent, dontNotify: Connection, value: string }
function notifyRoom({ room, event, dontNotify, value }: roomNotification) {
	connectionByUUID.forEach((con, uuid) => {
		if (con.roomId && con.roomId === room.id && con.id !== dontNotify.id) {
			const fn = updateFunctionByUUID.get(uuid);
			if (fn) fn(event, value);
		}
	});
}



const api = new Router();

//Add WebRTC SDP for room
api.post(`/${apiRoute["room/offerSessionDescription"]}`, async (ctx) => {
	const { status, body, room, con_req } = await getRoomInfo(ctx.request, { requireOwnership: true })
	if (!room || !body || !con_req) {
		ctx.response.status = status
		return
	}

	console.log(ctx.request.method, ctx.request.url.href)

	const session = webRtcSessionByRoomId.get(room.id) ?? {} as webRtcSession
	session.sdp = body;
	webRtcSessionByRoomId.set(room.id, session)

	notifyRoom({
		room,
		event: sseEvent.room_sessionDescriptionAdded,
		dontNotify: con_req,
		value: body
	});

	ctx.response.status = 200
})

api.get(`/${apiRoute["room/offerSessionDescription"]}`, async (ctx) => {
	const { status, room, con_req } = await getRoomInfo(ctx.request, {
		requireOwnership: false,
		requireBody: false
	})
	if (!room || !con_req) {
		ctx.response.status = status
		return
	}

	const session = webRtcSessionByRoomId.get(room.id) ?? {} as webRtcSession
	console.log(ctx.request.method, ctx.request.url.href)
	ctx.response.body = session.sdp
})

api.get(`/${apiRoute["room/answerSessionDescription"]}`, async (ctx) => {
	const { status, room, con_req } = await getRoomInfo(ctx.request, {
		requireOwnership: false,
		requireBody: false
	})
	if (!room || !con_req) {
		ctx.response.status = status
		return
	}

	const session = webRtcSessionByRoomId.get(room.id) ?? {} as webRtcSession
	console.log(ctx.request.method, ctx.request.url.href)
	ctx.response.body = session.answerSdp
})

//add offer candidate
api.post(`/${apiRoute["room/addOfferCandidate"]}`, async (ctx) => {

	const { status, body, room, con_req }
		= await getRoomInfo(ctx.request, { requireOwnership: false })
	if (!room || !body || !con_req) {
		ctx.response.status = status
		return
	}

	console.log(ctx.request.method, ctx.request.url.href)
	const session = webRtcSessionByRoomId.get(room.id) ?? {} as webRtcSession
	if (session.offerCandidates)
		session.offerCandidates?.push()
	else
		session.offerCandidates = [body]

	webRtcSessionByRoomId.set(room.id, session)

	//notify the room occupants of the new connection
	notifyRoom({
		room,
		event: sseEvent.room_offerCandidateAdded,
		dontNotify: con_req,
		value: body
	})

	ctx.response.status = 200
})

//add answer candidate
api.post(`/${apiRoute["room/addAnswerCandidate"]}`, async (ctx) => {

	const { status, body, room, con_req }
		= await getRoomInfo(ctx.request, { requireOwnership: false })
	if (!room || !body || !con_req) {
		ctx.response.status = status
		return
	}

	console.log(ctx.request.method, ctx.request.url.href)
	const session = webRtcSessionByRoomId.get(room.id) ?? {} as webRtcSession
	if (session.answerCandidates)
		session.answerCandidates?.push()
	else
		session.answerCandidates = [body]

	webRtcSessionByRoomId.set(room.id, session)

	//notify the room occupants of the new connection
	notifyRoom({
		room,
		event: sseEvent.room_answerCandidateAdded,
		dontNotify: con_req,
		value: body
	})

	ctx.response.status = 200
})

//answer call
api.post(`/${apiRoute["room/answerCall"]}`, async (ctx) => {

	const { status, body, room, con_req }
		= await getRoomInfo(ctx.request, { requireOwnership: false })
	if (!room || !body || !con_req) {
		ctx.response.status = status
		return
	}

	console.log(ctx.request.method, ctx.request.url.href)
	const session = webRtcSessionByRoomId.get(room.id) ?? {} as webRtcSession
	session.answerSdp = body

	webRtcSessionByRoomId.set(room.id, session)

	//notify the room occupants of the new connection
	notifyRoom({
		room,
		event: sseEvent.room_remoteAnswered,
		dontNotify: con_req,
		value: body
	})

	ctx.response.status = 200

})



//send DM to user
api.post(`/${apiRoute.dm}/:userId`, async (ctx) => {
	console.log(ctx.request.method.toUpperCase(), ctx.request.url.pathname, ctx.params.userId)
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
		ctx.response.status = 404
		return
	}

	updateFunctionByUUID.get(recipientUUID)?.call(this, sseEvent.dm, JSON.stringify({
		senderId: sender.id,
		message
	}))
	ctx.response.status = 200
})


//Join room by id
api.post(`/${apiRoute["room/join"]}/:id`, async (ctx) => {
	const roomId = ctx.params.id
	console.log("[JOIN ROOM] POST", apiRoute.room.toUpperCase(), roomId)
	const uuid = ctx.request.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);

	const con = connectionByUUID.get(uuid)
	if (!con) {
		ctx.response.status = 401 //unauthenticated)
		return
	}

	const room = rooms.find(room => room.id === roomId)
	if (!room) {
		ctx.response.status = 404
		return
	}

	con.roomId = room?.id
	updateAllConnections({
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
	rooms.push(room)

	updateAllConnections({
		connectionId: con.id,
		field: "roomId",
		value: room.id
	})
	updateAllConnections_newRoom(room)

	ctx.response.body = JSON.stringify(room)
})

//Delete room
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
	delete con.roomId
	updateAllConnections({
		connectionId: con.id,
		field: "roomId",
		value: ""
	})
	ctx.response.status = 200 //but we did successfully leave the room

	//are we the owner? Nuke it!
	const room = rooms.find(room => room.id === ctx.params.id)
	if (room && room.ownerId == con.id) {

		//kick all users from the room
		connectionByUUID.forEach(c => {
			if (c.roomId === room.id) {
				delete c.roomId
				updateAllConnections({
					connectionId: c.id,
					field: "roomId",
					value: ""
				})
			}
		})

		//delete webRTC stuff
		webRtcSessionByRoomId.delete(room.id)

		//delete the room
		rooms.splice(rooms.indexOf(room), 1)
		updateAllConnections_deleteRoom(room)
		ctx.response.body = room
		ctx.response.status = 200
	}
})

//Get room by id
api.get(`/${apiRoute.room}/:id`, async (ctx) => {
	ctx.response.body = rooms.find(room => room.id === ctx.params.id)
})

//Let a client clean up their old keys
api.post(`/${apiRoute.discardKey}/:key`, async (ctx) => {
	const uuid = ctx.request.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);

	//TODO: Do we need to verify that this user owned the previous key? 
	// they ARE bearer tokens afterall... don't share your keys!
	// probably just rate limit this to one per day or something

	const oldId = ctx.params.key
	const oldCon = connectionByUUID.get(oldId)
	console.log(apiRoute.discardKey.toUpperCase(), oldId, oldCon)

	const success = connectionByUUID.delete(oldId)
	if (success) {
		kv.set(KV_KEYS.connections, connectionByUUID)
		if (oldCon) updateAllConnections_deleteConnection(oldCon)
	}

	ctx.response.body = success
})

//nuke it from orbit
api.post(`/${apiRoute.clear}/:key`, async (ctx) => {
	if (ctx.params.key !== Deno.env.get("KV_CLEAR_KEY")) {
		ctx.response.status = 401 //unauthorized
		return
	}

	const oldData = objectFrom(connectionByUUID);
	console.log("CLEAR", oldData, rooms)
	ctx.response.body = oldData

	await kv.delete(KV_KEYS.connections)
	await kv.delete(KV_KEYS.rooms)
	connectionByUUID.clear()
	rooms.length = 0
	notifyAllConnections()
	updateFunctionByUUID.forEach(update => update(sseEvent.reconnect))
})

api.post(`/${apiRoute.setText}`, async (context) => {
	try {
		const text = await context.request.body.text()
		if (text.length > 123)
			throw new Error("invalid text")

		const update = updateConnectionProperty(context.request, "text", text)
		updateAllConnections(update)
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
		updateAllConnections(update)
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
	console.log("SSE", `Connect (${old ? "old" : "new"})`, uuid, context.request.ip, context.request.userAgent.os.name)

	context.response.headers.append("Content-Type", "text/event-stream");
	context.response.body = new ReadableStream({
		start(controller) {
			let connection = connectionByUUID.get(uuid)
			if (!connection) {
				connection = {
					id: Date.now().toString(),
					status: "online"
				}
				connectionByUUID.set(uuid, connection)
				updateAllConnections_newConnection(connection)
			} else {
				connection.status = "online"
				updateAllConnections({
					connectionId: connection.id,
					field: "status",
					value: "online"
				})
			}

			updateFunctionByUUID.set(uuid, (event, value) => {
				try {
					controller.enqueue(sseMessage(event, value))
				} catch (error) {
					console.error(uuid, error)
				}
			})

			console.log("SSE connection   ", uuid, connection)

			controller.enqueue(sseMessage(sseEvent.id, connection.id))
			controller.enqueue(sseMessage(sseEvent.pk, uuid))
			controller.enqueue(sseMessage(sseEvent.connections, JSON.stringify(Array.from(connectionByUUID.values()))))
			controller.enqueue(sseMessage(sseEvent.rooms, JSON.stringify(rooms)))
		},
		cancel() {
			const connection = connectionByUUID.get(uuid)
			if (!connection)
				throw new Error(`orphan disconnected! ${uuid}}`)

			console.log("SSE Disconnect   ", uuid, connection)
			connection.status = ""
			updateFunctionByUUID.delete(uuid)

			const update = updateConnectionProperty(context.request, "status", "")
			updateAllConnections(update)

			// //TEST DELETE!
			// console.log("DELETE", uuid, connection)
			// const success = connectionByUUID.delete(uuid)
			// if (success) {
			// 	kv.set(KV_KEYS.connections, connectionByUUID)
			// 	updateAllConnections_deleteConnection(connection)
			// }

		},
	});
});
