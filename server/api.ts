import { Request } from "jsr:@oak/oak@17/request";
import { Router } from "jsr:@oak/oak@17/router";
import * as db from "./db.ts";
import type { SSEvent, AuthTokenName, ApiRoute, Connection, DM, DMRequest, PositionMessage, Position, initiateCallResult, QuaternionTuple, AreaNotification } from "./types.ts";
import { onLocalBuild } from "./localHelper.ts";
import { Identity } from "./data/table/identity.ts";
import { AreaRecord } from "./data/table/area.ts";

export { api }

const sseEvent: { [Property in SSEvent]: Property } = {
	webRTC: "webRTC",
	refresh: "refresh",
	reconnect: "reconnect",
	new_connection: "new_connection",
	delete_connection: "delete_connection",
	update: "update",
	friendRequest: "friendRequest",
	friendList: "friendList",
	friendRequests: "friendRequests",
	friendRequestAccepted: "friendRequestAccepted",
	dm: "dm",
	initiateCall: "initiateCall",
	addArea: "addArea",
	removeArea: "removeArea",
	grabArea: "grabArea",
	releaseArea: "releaseArea"
}

const AUTH_TOKEN_HEADER_NAME: AuthTokenName = "Authorization"

const apiRoute: { [Property in ApiRoute]: Property } = {
	auth: "auth",
	connections: "connections",
	sse: "sse",
	setColor: "setColor",
	clear: "clear",
	discardKey: "discardKey",
	webRTC: "webRTC",
	becomeAnonymous: "becomeAnonymous",
	log: "log",
	friendRequest: "friendRequest",
	acceptFriendRequest: "acceptFriendRequest",
	dm: "dm",
	dmHistory: "dmHistory",
	dmUnread: "dmUnread",
	publicKey: "publicKey",
	position: "position",
	initiateCall: "initiateCall",
	area: "area",
	grabArea: "grabArea",
	releaseArea: "releaseArea"
}


//server is starting up... cleanup and then get persisted data
db.serverInitAndCleanup()
const connectionByUUID = db.connection.getConnectionsByUUID() ?? new Map<string, Connection>()
const wsByUUID = new Map<string, WebSocket>()
const updateFunctionByUUID = new Map<string, {
	isLocal: boolean,
	update: (event: SSEvent, value?: string) => void,
}>()


if (Deno.env.get('ENVIRONMENT') === 'local') {
	console.log('LOCAL BUILD watching for frontend changes...')
	onLocalBuild('./dist', 1000, () => {
		setTimeout(() => {
			console.log('LOCAL BUILD! Tell all connections to refresh...')
			//tell all connections to reload the page
			updateFunctionByUUID.forEach(updater => updater.update(sseEvent.refresh))
		}, 1000);
	})
}

export function validateConnectionByUUID(uuid: string) {
	return connectionByUUID.has(uuid)
}
export async function addConnectionIdentity(uuid: string, identity: Identity) {
	const con = connectionByUUID.get(uuid)

	if (!con) throw new Error(`connection not found for uuid ${uuid}`)
	if (!identity) throw new Error(`identity can not be ${identity}`)

	con.identity = identity

	const result = db.connection.persistConnection(uuid, con)

	con.identity!.id = result?.identity?.id
	console.log("addConnectionIdentity", con)

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

function notifyAllConnections(event: SSEvent, update: any, options?: { excludeUUID?: string }) {
	updateFunctionByUUID.forEach((fn, uuidToUpdate) => {
		if (!options?.excludeUUID || options?.excludeUUID !== uuidToUpdate) {
			console.log('NOTIFY ALL ➤', event.toUpperCase(), uuidToUpdate, update)
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
	let con: Connection | undefined;
	for (const c of connectionByUUID.values()) {
		if (c.id === id) {
			con = c;
			break;
		}
	}
	return con;
}

const api = new Router();

api.get(`/${apiRoute.position}`, async (ctx) => {

	if (!ctx.isUpgradable) {
		ctx.throw(501);
	}
	const socket = ctx.upgrade()
	let socketUuid: string
	socket.onmessage = (m) => {
		if (!socketUuid) {
			socketUuid = m.data as string;
			if (!connectionByUUID.has(socketUuid)) {
				socket.close(1011, 'first message must be a valid auth token')
				console.log("WS - first message was not a valid UUID", socketUuid)
				return
			}
			wsByUUID.set(socketUuid, socket)
			console.log(`POSITION SOCKET opened`, socketUuid, wsByUUID.size, 'connections')
			return
		}

		const con = connectionByUUID.get(socketUuid)
		if (!con) throw new Error("no connection found by UUID for web socket")

		const message = JSON.parse(m.data) as { position: Position, quaternion: QuaternionTuple }
		con.position = message.position
		con.quaternion = message.quaternion

		db.connection.persistPosition({
			uuid: socketUuid,
			position: JSON.stringify(message.position),
			quaternion: JSON.stringify(message.quaternion)
		})

		const pm: PositionMessage = {
			id: con.id,
			position: con.position,
			quaternion: con.quaternion
		}

		//broadcast the message to all other connected clients
		wsByUUID.forEach((ws, uuid) => {
			if (uuid !== socketUuid) {
				ws.send(JSON.stringify(pm))
			}
		})
	};
	socket.onclose = () => {
		wsByUUID.delete(socketUuid)
		console.log(`POSITION SOCKET closed`, socketUuid)
	}

	ctx.response.status = 200
})

//we just need to relay webRTC signaling messages between users so they can
//negotiate their own peer-to-peer connection. We don't care about
//the actual conent of the messages, only that they are properly routed.
//https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
api.post(`/${apiRoute.webRTC}/:userId`, async (ctx) => {
	// console.log(event(ctx.request))
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


api.post(`/${apiRoute.friendRequest}`, async (ctx) => {
	const { uuid, con: requestor } = getConnection(ctx.request);

	const requesteeId = await ctx.request.body.text()
	let requestee = getConnectionById(requesteeId);
	const requesteeUuid = getUUID(requesteeId)

	console.log("FRIEND REQUEST", { requesteeId, requestor, requestee })

	if (!requestee || !requesteeUuid) {
		ctx.response.status = 404
		return
	}

	if (!requestor.identity?.id || !requestee.identity?.id) {
		ctx.response.status = 405 //not allowed
		ctx.response.body = 'both parties must be identified'
		return
	}

	const friendRequest = db.friendRequest.addFriendRequest(requestor.identity?.id, requestee.identity?.id)
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

	if (!friendRequestId) throw new Error(`friend request id ${friendRequestId} not found`)

	const result = db.friendRequest.acceptFriendRequest(friendRequestId)

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
		delete con.identity
		db.connection.persistConnection(uuid, con)
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

//TODO: get this from cloudflare
const peerConfig: RTCConfiguration = {
	iceServers: [
		{
			urls: [
				'stun:stun.relay.metered.ca:80',
				'stun:stun1.l.google.com:19302',
				'stun:stun2.l.google.com:19302'
			],
		},
		{
			urls: "turn:global.relay.metered.ca:80",
			username: "20cd52d0dc022700b2755c26",
			credential: "MNMabfdDEZeLlOFU",
		},
		{
			urls: "turn:global.relay.metered.ca:80?transport=tcp",
			username: "20cd52d0dc022700b2755c26",
			credential: "MNMabfdDEZeLlOFU",
		},
		{
			urls: "turn:global.relay.metered.ca:443",
			username: "20cd52d0dc022700b2755c26",
			credential: "MNMabfdDEZeLlOFU",
		},
		{
			urls: "turns:global.relay.metered.ca:443?transport=tcp",
			username: "20cd52d0dc022700b2755c26",
			credential: "MNMabfdDEZeLlOFU",
		},
	],
	iceCandidatePoolSize: 10,
};

const calls: { id: string, from: string, to: string }[] = []

api.post(`/${apiRoute.initiateCall}`, async ctx => {
	try {
		const { con } = getConnection(ctx.request)
		const caller = con.id
		const callee = await ctx.request.body.json()

		const result: initiateCallResult = {
			polite: undefined,
			peerConfig
		}

		const pendingCall = calls.find(c => c.to == caller)
		if (pendingCall) {
			//we're answering a call
			calls.splice(calls.indexOf(pendingCall), 1)
			result.polite = true
			console.log('answer call from', callee, 'to', caller, `polite: ${result.polite}`)
		}
		else {
			//we're starting a new call
			calls.push({ id: crypto.randomUUID(), from: caller, to: callee })
			result.polite = false
			console.log('initiate call from', caller, 'to', callee, `polite: ${result.polite}`)

			//Send SSE message to the callee who will also POST to initiateCall
			const toUuid = getUUID(`${callee}`)
			if (toUuid) {
				const updateFn = updateFunctionByUUID.get(toUuid)
				updateFn?.update(sseEvent.initiateCall, caller)
			}
		}

		ctx.response.body = JSON.stringify(result)
		ctx.response.status = 200
	} catch (err) {
		console.error(err, ctx.request)
		ctx.response.status = 400
	}
})

api.post(`/${apiRoute.area}`, async ctx => {
	try {
		const { uuid, con } = getConnection(ctx.request)

		const area = await ctx.request.body.json() as AreaRecord
		console.log(ctx.request.url.pathname, uuid, area)

		if (!con.identity?.id) {
			ctx.response.status = 401 //unauthorized
			return
		}

		area.ownerIdentityId = con.identity?.id!

		db.area.add(area)

		notifyAllConnections(sseEvent.addArea, area, {
			excludeUUID: uuid
		})

		ctx.response.status = 200
	} catch (err) {
		console.error(err, ctx.request)
		ctx.response.status = 500
	}
})

api.post(`/${apiRoute.grabArea}`, async ctx => {
	try {
		const { uuid, con } = getConnection(ctx.request)

		const areaId = await ctx.request.body.text() as string
		console.log(ctx.request.url.pathname, uuid, areaId)

		if (!areaId) {
			ctx.response.status = 400
			ctx.response.body = "missing areaId"
			return
		}
		if (!con.identity?.id) {
			ctx.response.status = 401 //unauthorized
			return
		}

		const dbArea = db.area.getById(areaId, con.identity?.id)

		if (!dbArea) {
			ctx.response.status = 404
			return
		}

		//todo: retain grabbed areas in db

		const notification: AreaNotification = {
			conId: con.id,
			areaId
		}

		notifyAllConnections(sseEvent.grabArea, notification, {
			excludeUUID: uuid
		})

		ctx.response.status = 200
	} catch (err) {
		console.error(err, ctx.request)
		ctx.response.status = 500
	}
})

api.post(`/${apiRoute.releaseArea}`, async ctx => {
	try {
		const { uuid, con } = getConnection(ctx.request)

		const an = await ctx.request.body.json() as AreaNotification
		console.log(ctx.request.url.pathname, uuid, an.areaId)

		if (!an.areaId) {
			ctx.response.status = 400
			ctx.response.body = "missing areaId"
			return
		}
		if (!con.identity?.id) {
			ctx.response.status = 401 //unauthorized
			return
		}

		const dbArea = db.area.getById(an.areaId, con.identity?.id)

		if (!dbArea) {
			ctx.response.status = 404
			return
		}

		//TODO: retain grabbed areas in db

		//update area position
		dbArea.position = an.position
		const result = db.area.update(dbArea)

		notifyAllConnections(sseEvent.releaseArea, an, {
			excludeUUID: uuid
		})

		ctx.response.status = 200
	} catch (err) {
		console.error(err, ctx.request)
		ctx.response.status = 500
	}
})

api.delete(`/${apiRoute.area}/:id`, async ctx => {
	try {
		const { uuid, con } = getConnection(ctx.request)

		if (!con.identity?.id) {
			ctx.response.status = 401
			ctx.response.body = 'invalid owner identity id from request'
			return
		}

		if (ctx.params?.id?.length !== 36) {
			ctx.response.status = 400
			ctx.response.body = 'invalid area id'
			return
		}

		const areaId = ctx.params.id
		console.log(ctx.request.url.pathname, uuid, { areaId: areaId })

		const area = db.area.getById(areaId, con.identity.id)

		if (area.ownerIdentityId != con.identity?.id) {
			ctx.response.status = 403 //forbidden
			return
		}

		ctx.response.body = db.area.remove(areaId, con.identity.id)

		notifyAllConnections(sseEvent.removeArea, areaId, {
			excludeUUID: uuid
		})

		ctx.response.status = 200
	} catch (err) {
		console.error(err, ctx.request)
		ctx.response.status = 500
	}
})

api.get(`/${apiRoute.area}`, async (ctx) => {
	const uuid = ctx.request.headers.get(AUTH_TOKEN_HEADER_NAME)
	if (!uuid) {
		ctx.response.status = 401
		return
	}

	const areas = db.area.getAll()

	ctx.response.body = JSON.stringify(Array.from(areas.values()))
})

api.post(`/${apiRoute.setColor}`, async (ctx) => {
	try {
		const color = await ctx.request.body.text()
		if (!color.startsWith("#") || color.length > 9)
			throw new Error("invalid color")

		const { uuid, con } = getConnection(ctx.request)
		con.color = color
		db.connection.persistConnection(uuid, con)
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

api.post(`/${apiRoute.publicKey}`, async (ctx) => {
	const { uuid, con } = getConnection(ctx.request)
	const publicKey = await ctx.request.body.text()

	if (!publicKey) {
		ctx.response.status = 400 //bad request
	}

	con.publicKey = publicKey
	db.connection.persistPublicKey({ uuid, publicKey })
	console.log('PUBLIC KEY saved for', con.identity ? `${con.identity.source}:${con.identity.name}` : `conId:${con.id}`, uuid)
	ctx.response.status = 200

	//tell everyone else that I have a new public key
	notifyAllConnections(sseEvent.update, {
		connectionId: con.id,
		field: "publicKey",
		value: con.publicKey
	}, { excludeUUID: uuid })
})

api.post(`/${apiRoute.dmHistory}`, async (ctx) => {
	const { uuid } = getConnection(ctx.request)

	const dmRequest = await ctx.request.body.json() as DMRequest
	//a null timestamp converts to 0 which is 1970-01-01T00:00:00.000Z
	dmRequest.timestamp = new Date(dmRequest.timestamp ?? null).valueOf()

	if (!dmRequest || !dmRequest.qty || dmRequest.qty <= 0 || !(dmRequest.timestamp >= 0)) {
		ctx.response.status = 400 //bad request
		const message = []
		if (!dmRequest.qty) message.push('invalid qty')
		if (!(dmRequest.timestamp >= 0)) message.push('invalid timestamp')
		ctx.response.body = message.join()
		return
	}

	const otherUuid = getUUID(dmRequest.conId)
	if (!otherUuid) {
		ctx.response.status = 404 //not found
		ctx.response.body = 'invalid conId'
		return
	}

	const messages = db.directMessage.getDirectMessagesBeforeTimestamp(uuid, otherUuid, dmRequest)
	ctx.response.body = messages
})

api.post(`/${apiRoute.dmUnread}`, async (ctx) => {
	const { uuid } = getConnection(ctx.request)

	const dmRequest = await ctx.request.body.json() as DMRequest

	//a null timestamp converts to 0 which is 1970-01-01T00:00:00.000Z
	const timestamp = new Date(dmRequest.timestamp ?? null).valueOf()

	console.log('DM UNREAD', timestamp, dmRequest, dmRequest.timestamp)

	if (!dmRequest || dmRequest.qty) {
		ctx.response.status = 400 //bad request
		return
	}

	const otherUuid = getUUID(dmRequest.conId)
	if (!otherUuid) {
		ctx.response.status = 404 //not found
		return
	}

	const messages = db.directMessage.getDriectMessagesAfterTimestamp(uuid, otherUuid, timestamp)
	ctx.response.body = messages
})

api.post(`/${apiRoute.dm}`, async (ctx) => {
	try {
		const { uuid: fromUuid, con: fromCon } = getConnection(ctx.request)
		const message = await ctx.request.body.json() as DM
		const toCon = getConnectionById(message.toId)
		if (!toCon) {
			ctx.response.status = 404
			ctx.response.body = 'no connection with specified id'
			console.log('no connection with specified id')
			return
		}

		//extra checks for key sharing
		if (message.kind === 'key-share') {
			//does the identity match?
			if (!toCon.identity
				|| !fromCon.identity
				|| toCon.identity.source !== fromCon.identity.source
				|| toCon.identity.id !== fromCon.identity.id
			) {
				ctx.response.status = 403 //forbidden
				return
			}
		}

		const toUuid = getUUID(toCon.id)
		if (!toUuid) {
			ctx.response.status = 500
			ctx.response.body = 'uuid not found for connection'
			console.log('uuid not found for connection')
			return
		}

		//do not try to persist messages from anonymous users
		let dmId, dmTimestamp
		if(toCon.identity?.id && fromCon.identity?.id)
		{
			const persistedDm = db.directMessage.persistDm({
				toIdentityId: toCon.identity?.id,
				fromIdentityId: fromCon.identity?.id,
				toUuid,
				fromUuid,
				message: message.message
			})

			dmId = persistedDm.id
			dmTimestamp = persistedDm.timestamp
		}

		//overwrite any data from the sender that they should not control
		message.id = dmId ?? Date.now()
		message.fromId = fromCon.id
		message.fromName = fromCon.identity?.name
		message.timestamp = (dmTimestamp ?? Date.now()) * 1000 //we don't need a subsecond timestamp on the frontend

		ctx.response.status = 200
		ctx.response.body = message

		//TODO: send push notification (perhaps have an updater that does this?)

		
		const updateFn = updateFunctionByUUID.get(toUuid)
		if (updateFn) {
			updateFn.update(sseEvent.dm, JSON.stringify(message))
		}
		
		//TODO: update all connections owned by the sender or the receiver, except the intitial sender.
		// const identitiesToUpdate = [toCon.identity?.id, fromCon.identity?.id]
		// connectionByUUID.forEach((con, uuid) => {
		// 	if (uuid !== fromUuid
		// 		&& con.identity?.id
		// 		&& identitiesToUpdate.includes(con.identity.id)) {
		// 			//this is doing nothing?
		// 	}
		// })

	} catch (err) {
		console.error(err, ctx.request)
		ctx.response.status = 400
	}
});

api.get(`/${apiRoute.connections}`, async (ctx) => {
	const uuid = ctx.request.headers.get(AUTH_TOKEN_HEADER_NAME)
	if (!uuid) {
		ctx.response.status = 401
		return
	}

	ctx.response.body = JSON.stringify(Array.from(connectionByUUID.values()))
})

api.post(`/${apiRoute.auth}`, async context => {
	//get the user's bearer token or create a new one
	const oldKey = context.request.headers.get(AUTH_TOKEN_HEADER_NAME)
	let uuid = oldKey ?? crypto.randomUUID()

	if (!uuid || uuid.length !== 36) {
		console.warn(`uuid cannot be ${typeof uuid} ${uuid}`)
		uuid = crypto.randomUUID()
	}

	const old = connectionByUUID.has(uuid)
	console.log("AUTH", `Connect (${old ? "old" : "new"})`, uuid, context.request.ip, context.request.userAgent.os.name)
	let connection = connectionByUUID.get(uuid)

	if (!connection) {
		connection = {
			id: Date.now().toString()
		}
		connectionByUUID.set(uuid, connection)
		notifyAllConnections(sseEvent.new_connection, connection, { excludeUUID: uuid })
	}

	context.response.body = JSON.stringify({ uuid, self: connection })
})

api.get(`/${apiRoute.sse}`, async (context) => {
	const uuid = context.request.headers.get(AUTH_TOKEN_HEADER_NAME)
	if (!uuid) {
		context.response.status = 400 //bad request
		context.response.body = `missing ${AUTH_TOKEN_HEADER_NAME} header`
		return
	}

	if (!connectionByUUID.has(uuid)) {
		context.response.status = 401 //unauthorized
		return
	}

	console.log("SSE", `Connect`, uuid, context.request.ip, context.request.userAgent.os.name)
	const connection = connectionByUUID.get(uuid)
	if (!connection) {
		console.error(`connection not found for ${uuid}`)
		context.response.status = 500
		return
	}

	context.response.headers.append("Content-Type", "text/event-stream");
	context.response.body = new ReadableStream({
		async start(controller) {

			connection.status = "online"
			connection.kind = context.request.userAgent.os.name

			try {
				db.connection.persistConnection(uuid, connection)
			} catch (error) {
				console.error(error)
				return
			}

			updateFunctionByUUID.set(uuid, {
				isLocal: true, update: (event, value) => {
					try {
						controller.enqueue(sseMessage(event, value))
					} catch (error) {
						console.error(uuid, error)
					}
				}
			})

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

			//console.log("SSE Disconnect   ", uuid, connection)
			connection.status = ""

			//cleanup
			if (!connection.position) {
				console.log(`cleanup`, uuid, connection)
				db.connection.deleteConnection(uuid)
				connectionByUUID.delete(uuid)
				notifyAllConnections(sseEvent.delete_connection, connection.id)
			}
			else {
				notifyAllConnections(sseEvent.update, {
					connectionId: connection.id,
					field: "status",
					value: ""
				})
			}
		}
	});
});
