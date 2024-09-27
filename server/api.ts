import { Request } from "https://jsr.io/@oak/oak/17.0.0/request.ts";
import { Router } from "jsr:@oak/oak@17/router";

export { api }

export type AuthTokenName = "Authorization"
export type ApiRoute = "sse" | "setColor" | "setText"
export type SSEvent = "pk" | "id" | "connections"
export type Connection = {
	id: string,
	color?: string,
	text?: string,
	status?: string
}

const sseEvent: { [Property in SSEvent]: Property } = {
	pk: "pk",
	id: "id",
	connections: "connections"
}

const AUTH_TOKEN_HEADER_NAME: AuthTokenName = "Authorization"

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	setColor: "setColor",
	setText: "setText"
}

const connectionByUUID = new Map<string, Connection>()
const updateFunctionByUUID = new Map<string, (value: string) => void>()

// async function initKV() {
// 	const kv = await Deno.openKv();
// 	const connections = await kv.get(['connections'])

// 	console.log(connections)

// 	return kv
// }

// const kv = await initKV()

// async function persist(kv: Deno.Kv) {
// 	// const connections = Array.from(connectionByUUID.values())
// 	//console.log('persist', connectionByUUID)
// 	await kv.set(['connections'], connectionByUUID)
// }

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
	// persist(kv)

	const connections = Array.from(connectionByUUID.values())
	const value = JSON.stringify(connections)
	updateFunctionByUUID.forEach(update => update(value))
}

function updateConnectionProperty(req: Request, prop: keyof Connection, value: string) {
	const uuid = req.headers.get(AUTH_TOKEN_HEADER_NAME);
	if (!uuid) throw new Error(`Missing ${AUTH_TOKEN_HEADER_NAME} header`);
	const con = connectionByUUID.get(uuid);
	if (!con) throw new Error(`No connection found for key ${uuid}`);
	con[prop] = value;
	connectionByUUID.set(uuid, con);
}

const api = new Router();
api.post(`/${apiRoute.setText}`, async (context) => {
	try {
		updateConnectionProperty(context.request, "text", await context.request.body.text());
		context.response.status = 200
		notifyAllConnections()
	} catch (err) {
		console.error(err, context.request)
	}
})

api.post(`/${apiRoute.setColor}`, async (context) => {
	try {
		updateConnectionProperty(context.request, "color", await context.request.body.text());
		context.response.status = 200
		notifyAllConnections()
	} catch (err) {
		console.error(err, context.request)
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

			updateFunctionByUUID.set(uuid, (value) => {
				try {
					controller.enqueue(sseMessage(sseEvent.connections, value))
				} catch (error) {
					console.error(uuid, error)
				}
			})

			console.log("SSE connection   ", uuid, connection)
			// console.log(connectionByUUID)
			// console.log(updateFunctionByUUID)

			controller.enqueue(sseMessage(sseEvent.id, connection?.id ?? "ERROR"))
			controller.enqueue(sseMessage(sseEvent.pk, uuid))
			notifyAllConnections()
		},
		cancel() {
			updateFunctionByUUID.delete(uuid)
			const connection = connectionByUUID.get(uuid)
			if (connection) connection.status = ""

			console.log("SSE Disconnect   ", uuid, connection)
			// console.log(connectionByUUID)
			// console.log(updateFunctionByUUID)

			notifyAllConnections()
		},
	});
});
