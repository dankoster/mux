import { Router } from "jsr:@oak/oak@17/router";


export const api = new Router();
export type ApiRoute = "sse" | "setColor"
export type SSEvent = "pk" | "id" | "connections"

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	setColor: "setColor",
};

//https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
function sseMessage(event: SSEvent, data?: string, id?: string) {
	const lines = [];
	if (event) lines.push(`event: ${event}`);
	if (id) lines.push(`id: ${id}`);
	if (data) lines.push(`data: ${data}`);
	lines.push('\r\n');
	const msg = lines.join('\r\n');
	return new TextEncoder().encode(msg);
}

export type Connection = {
	id: number,
	color?: string,
	update: (key: string, value: string) => void
}

const connections: Array<Connection> = []
const privateKeys: { [key: string]: string } = {}

function getId(pk: string) {
	const str = Object.keys(privateKeys).find(id => privateKeys[id] === pk)
	return str && Number.parseInt(str)
}

function notifyAllConnections() {
	const value = JSON.stringify(connections)
	connections.forEach(con => con.update(apiRoute.sse, value))
}

api.post(`/${apiRoute.setColor}`, async (context) => {
	const pk = context.request.headers.get('pk')
	if (!pk)
		throw new Error('missing pk header')

	const id = getId(pk)
	const color = await context.request.body.text()
	const index = connections.findIndex(c => c.id === id)
	connections[index].color = color
	context.response.status = 200
	notifyAllConnections()
});

//https://deno.com/blog/deploy-streams
api.get(`/${apiRoute.sse}`, async (context) => {
	const id = Date.now()
	context.response.headers.append("Content-Type", "text/event-stream");
	context.response.body = new ReadableStream({
		start(controller) {
			//console.log('SSE connected', context.request, id)
			if (!connections.some(c => c.id === id)) {
				connections.push({
					id,
					update: (key, value) => controller.enqueue(sseMessage('connections', value))
				})
			}
			privateKeys[id] = crypto.randomUUID()
			controller.enqueue(sseMessage('id', id.toString()))
			controller.enqueue(sseMessage('pk', privateKeys[id]))
			notifyAllConnections()
		},
		cancel() {
			//console.log('SSE disconnected', context.request.ip, id)
			delete (privateKeys[id])
			const index = connections.findIndex(c => id === c.id)
			if (index >= 0)
				connections.splice(index, 1)
			notifyAllConnections()
		},
	});
});
