import { Request } from "https://jsr.io/@oak/oak/17.0.0/request.ts";
import { Router } from "jsr:@oak/oak@17/router";

export { api }

export type ApiRoute = "sse" | "setColor" | "setText"
export type SSEvent = "pk" | "id" | "connections"
export type Connection = {
	id: number,
	color?: string,
	text?: string,
	update: (key: string, value: string) => void
}

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	setColor: "setColor",
	setText: "setText"
};

const connections: Array<Connection> = []
const privateKeys: { [key: string]: string } = {}

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
	const value = JSON.stringify(connections)
	connections.forEach(con => con.update(apiRoute.sse, value))
}

function getId(pk: string) {
	const str = Object.keys(privateKeys).find(id => privateKeys[id] === pk)
	return str && Number.parseInt(str)
}

function getPkHeader(request: Request) {
	const pk = request.headers.get('pk');
	if (!pk)
		throw new Error('missing pk header');
	return pk;
}

function getConnectionIndex(id: string | number | undefined) {
	const index = connections.findIndex(c => c.id === id);

	if (!connections[index]) throw new Error(`${index} not found in connections`);
	
	return index;
}

const api = new Router();
api.post(`/${apiRoute.setText}`, async (context) => {
	const pk = getPkHeader(context.request);
	const id = getId(pk);
	const index = getConnectionIndex(id);
	connections[index].text = await context.request.body.text();
	context.response.status = 200
	notifyAllConnections()
})

api.post(`/${apiRoute.setColor}`, async (context) => {
	const pk = getPkHeader(context.request);
	const id = getId(pk);
	const index = getConnectionIndex(id);
	connections[index].color = await context.request.body.text();
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
