import { Request } from "https://jsr.io/@oak/oak/17.0.0/request.ts";
import { Router } from "jsr:@oak/oak@17/router";

export { api }

export type AuthTokenName = "Authorization"
export type ApiRoute = "sse" | "setColor" | "setText" | "clear" | "discardKey"
export type SSEvent = "pk" | "id" | "connections" | "new_connection" | "delete_connection" | "update" | "reconnect"
export type Connection = {
	id: string,
	color?: string,
	text?: string,
	status?: string
}
export type Update = {
	connectionId: string,
	field: keyof Connection,
	value: string
}

const sseEvent: { [Property in SSEvent]: Property } = {
	pk: "pk",
	id: "id",
	connections: "connections",
	reconnect: "reconnect",
	new_connection: "new_connection",
	delete_connection: "delete_connection",
	update: "update"
}

const AUTH_TOKEN_HEADER_NAME: AuthTokenName = "Authorization"

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	setColor: "setColor",
	setText: "setText",
	clear: "clear",
	discardKey: "discardKey"
}

const KV_KEY_connections = ['connections']
const kv = await Deno.openKv();
const result = await kv.get<Map<string, Connection>>(KV_KEY_connections)
const connectionByUUID = result.value ?? new Map<string, Connection>()
const updateFunctionByUUID = new Map<string, (event: SSEvent, value?: string) => void>()
console.log("INIT Got connections from KV:", connectionByUUID)


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
	kv.set(KV_KEY_connections, connectionByUUID)
	const connections = Array.from(connectionByUUID.values())
	const value = JSON.stringify(connections)
	updateFunctionByUUID.forEach(update => update(sseEvent.connections, value))
}

function updateAllConnections(update: Update) {
	console.log(sseEvent.update.toUpperCase(), update)
	kv.set(KV_KEY_connections, connectionByUUID)
	var updateUuid = getUUID(update.connectionId);
	updateFunctionByUUID.forEach((fn, uuid) => {
		if (uuid !== updateUuid)
			fn(sseEvent.update, JSON.stringify(update))
	})
}

function updateAllConnections_newConnection(connection: Connection) {
	console.log(sseEvent.update.toUpperCase(), connection)
	kv.set(KV_KEY_connections, connectionByUUID)
	var updateUuid = getUUID(connection.id);
	updateFunctionByUUID.forEach((fn, uuid) => {
		if (uuid !== updateUuid)
			fn(sseEvent.new_connection, JSON.stringify(connection))
	})
}

function updateAllConnections_deleteConnection(connection: Connection) {
	console.log(sseEvent.update.toUpperCase(), connection)
	kv.set(KV_KEY_connections, connectionByUUID)
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

const api = new Router();
api.post(`/${apiRoute.discardKey}/:key`, async (ctx) => {
	const uuid = ctx.request.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);

	const oldId = ctx.params.key
	const oldCon = connectionByUUID.get(oldId)
	console.log(apiRoute.discardKey.toUpperCase(), oldId, oldCon)

	const success = connectionByUUID.delete(oldId)
	if (success) {
		kv.set(KV_KEY_connections, connectionByUUID)
		if (oldCon) updateAllConnections_deleteConnection(oldCon)
	}

	ctx.response.body = success
})

api.post(`/${apiRoute.clear}/:key`, async (ctx) => {
	if (ctx.params.key !== Deno.env.get("KV_CLEAR_KEY")) {
		ctx.response.status = 401 //unauthorized
		return
	}

	const oldData = objectFrom(connectionByUUID);
	console.log("CLEAR", oldData)
	ctx.response.body = oldData

	await kv.delete(KV_KEY_connections)
	connectionByUUID.clear()
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

//https://deno.com/blog/deploy-streams
api.get(`/${apiRoute.sse}`, async (context) => {
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
			// 	kv.set(KV_KEY_connections, connectionByUUID)
			// 	updateAllConnections_deleteConnection(connection)
			// }

		},
	});
});
