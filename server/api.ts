import { Request } from "jsr:@oak/oak@17/request";
import { Router } from "jsr:@oak/oak@17/router";
import * as db from "./db.ts";
import type { SSEvent, AuthTokenName, ApiRoute, Connection, Identity, Update, DM, DMRequest, PositionMessage, Position } from "./types.ts";
import { onLocalBuild } from "./localHelper.ts";
import { MediaType } from "jsr:@oak/commons@^1.0/media_types";

export { api }

const sseEvent: { [Property in SSEvent]: Property } = {
	pk: "pk",
	id: "id",
	webRTC: "webRTC",
	connections: "connections",
	refresh: "refresh",
	reconnect: "reconnect",
	new_connection: "new_connection",
	delete_connection: "delete_connection",
	update: "update",
	friendRequest: "friendRequest",
	friendList: "friendList",
	friendRequests: "friendRequests",
	friendRequestAccepted: "friendRequestAccepted",
	dm: "dm"
}

const AUTH_TOKEN_HEADER_NAME: AuthTokenName = "Authorization"

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	setColor: "setColor",
	setText: "setText",
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
	position: "position"
}


//server is starting up... cleanup and then get persisted data
db.serverInitAndCleanup()
const connectionByUUID = db.getConnectionsByUUID() ?? new Map<string, Connection>()
const wsByUUID = new Map<string, WebSocket>()
const updateFunctionByUUID = new Map<string, {
	isLocal: boolean,
	update: (event: SSEvent, value?: string) => void,
}>()


if (Deno.env.get('ENVIRONMENT') === 'local') {
	console.log('LOCAL BUILD watching for frontend changes...')
	onLocalBuild('./dist', 1000, () => {
		console.log('LOCAL BUILD! Tell all connections to refresh...')
		//tell all connections to reload the page
		updateFunctionByUUID.forEach(updater => updater.update(sseEvent.refresh))
	})
}

export function validateConnectionByUUID(uuid: string) {
	return connectionByUUID.has(uuid)
}
export async function addConnectionIdentity(uuid: string, identity: Identity) {
	const con = connectionByUUID.get(uuid)
	if (!con) throw new Error(`connection not found for uuid ${uuid}`)
	con.identity = identity

	const result = db.persistConnection(uuid, con)

	con.identity.id = result?.identity?.id
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

function notifyAllConnections(event: SSEvent, update: Update | Connection, options?: { excludeUUID?: string }) {
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

function objectFrom<V>(map: Map<string, V>) {
	const obj: { [key: string]: V } = {};
	for (const [key, val] of map) {
		obj[key] = val;
	}
	return obj;
}

function event(req: Request) {
	return `${req.method} ${req.url.pathname}`.toUpperCase()
}

const api = new Router();


const lastWsMessageByUUID = new Map<string, string>()

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
				socket.close(1011, 'first message must be auth token')
				console.log("WS - first message was not UUID")
				return
			}
			wsByUUID.set(socketUuid, socket)

			//send current state (even to self, so we remember our position)
			lastWsMessageByUUID.forEach((message) => {
				socket.send(message)
			})
			return
		}

		const con = connectionByUUID.get(socketUuid)
		if (!con) throw new Error("no connection found by UUID for web socket")

		con.position = JSON.parse(m.data) as Position
		db.persistConnection(socketUuid, con)
		const pm: PositionMessage = {
			id: con.id,
			position: con.position
		}
		const messageString = JSON.stringify(pm)
		
		//broadcast the message to all other connected clients
		lastWsMessageByUUID.set(socketUuid, messageString)
		wsByUUID.forEach((ws, uuid) => {
			if (uuid !== socketUuid) {
				ws.send(messageString)
			}
		})
	};
	socket.onclose = () => {
		wsByUUID.delete(socketUuid)
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

//nuke it from orbit
api.post(`/${apiRoute.clear}/:key`, async (ctx) => {
	//do we have the correct bearer token for this?
	if (ctx.params.key !== Deno.env.get("KV_CLEAR_KEY")) {
		ctx.response.status = 401 //unauthorized
		return
	}

	//here's what we're deleting...
	const oldData = objectFrom(connectionByUUID);
	console.log("CLEAR", oldData)
	ctx.response.body = oldData

	connectionByUUID.forEach((con, uuid) => db.deleteConnection(uuid))

	//reinit with empty everything
	connectionByUUID.clear()

	//tell all clients to reconnect
	updateFunctionByUUID.forEach(updater => updater.update(sseEvent.reconnect))
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
	db.persistPublicKey({ uuid, publicKey })
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

	const messages = db.getDirectMessagesBeforeTimestamp(uuid, otherUuid, dmRequest)
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

	const messages = db.getDriectMessagesAfterTimestamp(uuid, otherUuid, timestamp)
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

		const persistedDm = db.persistDm({
			toUuid,
			fromUuid,
			message: message.message
		})

		//overwrite any data from the sender that they should not control
		message.id = persistedDm.id
		message.fromId = fromCon.id
		message.fromName = fromCon.identity?.name
		message.timestamp = (persistedDm.timestamp ?? 0) * 1000 //we don't need a subsecond timestamp on the frontend

		ctx.response.status = 200
		ctx.response.body = message

		//TODO: send push notification (perhaps have an updater that does this?)

		//update all connections owned by the sender or the receiver, except the intitial sender.
		const identitiesToUpdate = [toCon.identity?.id, fromCon.identity?.id]
		connectionByUUID.forEach((con, uuid) => {
			if (uuid !== fromUuid
				&& con.identity?.id
				&& identitiesToUpdate.includes(con.identity.id)) {

				const updateFn = updateFunctionByUUID.get(uuid)
				if (updateFn) {
					updateFn.update(sseEvent.dm, JSON.stringify(message))
				}
			}
		})

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

			try {
				db.persistConnection(uuid, connection)
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

			//The user has connected!  Send them a bunch of stuff!
			//console.log("SSE connection   ", uuid, connection)
			controller.enqueue(sseMessage(sseEvent.id, connection.id))
			controller.enqueue(sseMessage(sseEvent.pk, uuid))
			controller.enqueue(sseMessage(sseEvent.connections, JSON.stringify(Array.from(connectionByUUID.values()))))

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

			//console.log("SSE Disconnect   ", uuid, connection)
			connection.status = ""

			notifyAllConnections(sseEvent.update, {
				connectionId: connection.id,
				field: "status",
				value: ""
			})
		}
	});
});
