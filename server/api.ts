import { Router } from "jsr:@oak/oak@17/router";


export const api = new Router();
export type ApiRoute = "sse" | "hello"

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	hello: "hello"
};

type player = {
	id: string,
	color: string
}
type room = {
	id: number,
	players: player[]
}
type rooms = room[]


//https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
function sseMessage(event: string, data?: string, id?: string) {
	const lines = [];
	if (event) lines.push(`event: ${event}`);
	if (id) lines.push(`id: ${id}`);
	if (data) lines.push(`data: ${data}`);
	lines.push('\r\n');
	const msg = lines.join('\r\n');
	return new TextEncoder().encode(msg);
}

type connection = {
	ip: string,
	id: number,
	update: (key: string, value: string) => void
}

const connections: Array<connection> = []

function notifyAllConnections() {
	const value = connections.map(c => `${c.ip}-${c.id}`)
	console.log('-- notifyAllConnections', value)
	connections.forEach(con => con.update(apiRoute.sse, JSON.stringify(value)))
}

async function getHelloData() {
	return { data: 'hello world' }
}

//https://deno.com/blog/deploy-streams
api.get(`/${apiRoute.sse}`, async (context) => {
	const id = Date.now()
	context.response.headers.append("set-cookie", `sse_id=${id}`)
	context.response.headers.append("Content-Type", "text/event-stream");
	context.response.body = new ReadableStream({
		start(controller) {
			console.log('SSE connected', context.request.ip, id)
			if (!connections.some(c => c.ip === context.request.ip && c.id === id)) {
				connections.push({
					ip: context.request.ip,
					id,
					update: (key, value) => controller.enqueue(sseMessage(key, value))
				})
			}
			notifyAllConnections()
		},
		cancel() {
			console.log('SSE disconnected', context.request.ip)
			const index = connections.findIndex(c => context.request.ip === c.ip && id === c.id)
			if (index >= 0) 
				connections.splice(index, 1)
			notifyAllConnections()
		},
	});
});

api.get(`/${apiRoute.hello}`, async (context) => {
	const data = JSON.stringify(await getHelloData());
	context.response.body = data;

});
