import { Request } from "https://jsr.io/@oak/oak/17.0.0/request.ts";
import { Router } from "jsr:@oak/oak@17/router";

export { api }

export type AuthTokenName = "Authorization"
export type ApiRoute = "sse" | "setColor" | "setText" | "clear"
export type SSEvent = "pk" | "id" | "connections" | "upate" | "reconnect"
export type Connection = {
	id: string,
	color?: string,
	text?: string,
	status?: string
}
export type Update = {
	connectionId: string,
	field: keyof Connection,
	value: string,
}

const sseEvent: { [Property in SSEvent]: Property } = {
	pk: "pk",
	id: "id",
	connections: "connections",
	reconnect: "reconnect",
	upate: "upate"
}

const AUTH_TOKEN_HEADER_NAME: AuthTokenName = "Authorization"

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	setColor: "setColor",
	setText: "setText",
	clear: "clear"
}

const KV_KEY_connections = ['connections']
const kv = await Deno.openKv();
const connections = await kv.get<Map<string, Connection>>(KV_KEY_connections)
const connectionByUUID = connections.value ?? new Map<string, Connection>()
const updateFunctionByUUID = new Map<string, (event: SSEvent, value?: string) => void>()

console.log("Got connections from KV:", connectionByUUID)


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
	updateFunctionByUUID.forEach(fn => fn(sseEvent.upate, JSON.stringify(update)))
}

function updateConnectionProperty(req: Request, field: keyof Connection, value: string): Update {
	const uuid = req.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);
	const con = connectionByUUID.get(uuid);
	if (!con) throw new Error(`No connection found for key ${uuid}`);
	con[field] = value;
	return { connectionId: con.id, field, value }
}

const api = new Router();
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
	const oldId = context.request.headers.get(AUTH_TOKEN_HEADER_NAME)
	const uuid = oldId ?? crypto.randomUUID()

	const old = connectionByUUID.has(uuid)
	console.log("SSE", `Connect (${old ? "old" : "new"})`, uuid, context.request.ip, context.request.userAgent.os.name)

	context.response.headers.append("Content-Type", "text/event-stream");
	context.response.body = new ReadableStream({
		start(controller) {
			let connection = connectionByUUID.get(uuid)
			if (!connection) {
				connection = { id: Date.now().toString() }
				connectionByUUID.set(uuid, connection)
			}

			connection.status = "online"

			updateFunctionByUUID.set(uuid, (event, value) => {
				try {
					controller.enqueue(sseMessage(event, value))
				} catch (error) {
					console.error(uuid, error)
				}
			})

			console.log("SSE connection   ", uuid, connection)

			controller.enqueue(sseMessage(sseEvent.id, connection?.id ?? "ERROR"))
			controller.enqueue(sseMessage(sseEvent.pk, uuid))
			notifyAllConnections()
		},
		cancel() {
			const connection = connectionByUUID.get(uuid)
			if (connection) connection.status = ""
			console.log("SSE Disconnect   ", uuid, connection)

			//persistent connections work with a backing store (denoKV in this case)
			//connectionByUUID.delete(uuid)
			updateFunctionByUUID.delete(uuid)

			notifyAllConnections()
		},
	});
});

function objectFrom<V>(map: Map<string, V>) {
	const obj: { [key: string]: V } = {};
	for (const [key, val] of map) {
		obj[key] = val;
	}
	return obj;
}
