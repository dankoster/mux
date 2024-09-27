import { API_URI } from "./API_URI";
import type { ApiRoute, Connection, SSEvent } from "../server/api";
import { createSignal } from "solid-js";

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	setColor: "setColor",
	setText: "setText"
};
const sse: { [Property in SSEvent]: Property } = {
	pk: "pk",
	id: "id",
	connections: "connections"
}
const AUTH_TOKEN_HEADER_NAME = "Authorization"

const [connections, setConnections] = createSignal<Connection[]>([])
const [id, setId] = createSignal("")
const [pk, setPk] = createSignal("")

export default { id, connections, setColor, setText }

initSSE()

async function initSSE() {
	const pk = localStorage.getItem('pk')
	const headers = {
		'Content-Type': 'text/event-stream',
	}
	headers[AUTH_TOKEN_HEADER_NAME] = pk
	const response = await fetch(`${API_URI}/${apiRoute.sse}`, {
		method: 'GET',
		headers
	})

	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;

		const events = parseEventStream(value)
		events.forEach(event => handleSseEvent(event))
	}
}

type SSEventPayload = {
	event?: string;
	data?: string;
	id?: string;
	retry?: string;
}

function parseEventStream(value: string) {
	//https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
	return value.split('\r\n\r\n')
		.filter(e => e)
		.map(s => s.split('\r\n'))
		.map(event => {
			const eventObj: SSEventPayload = {};
			event.map(e => e.split(': ')).forEach(part => {
				eventObj[part[0]] = part[1];
			});
			return eventObj;
		});
}

function handleSseEvent(event: SSEventPayload) {
	switch (event.event) {
		case sse.pk:
			setPk(event.data);
			console.log(`${event.event}`, event.data);
			break;
		case sse.id:
			setId(event.data);
			console.log(`${event.event}`, event.data);
			break;
		case sse.connections:
			const data = JSON.parse(event.data);
			setConnections(data);
			console.log(`${event.event}`, data);
			break;
		default:
			console.warn(`Unknown SSE field "${event.event}"`, event.data)
			break;
	}
}

// // https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
//const eventStream = new EventSource(`${API_URI}/${apiRoute.sse}`);
// eventStream.addEventListener(sse.connections, (event) => {
// 	const data = JSON.parse(event) as Connection[]
// 	setConnections(data)
// });
// eventStream.addEventListener(sse.pk, (event) => {
// 	const key = event.data
// 	setPk(key)

// 	const prevColor = localStorage.getItem('color')
// 	if(prevColor) setColor(prevColor, key)

// 	const prevText = localStorage.getItem('text')
// 	if(prevText) setText(prevText, key)
// });
// eventStream.addEventListener(sse.id, (event) => {
// 	setId(event.data)
// });

const Bearer = (token) => `${token}`

function setColor(color: string, key?: string) {
	localStorage.setItem('color', color)
	const headers = {}
	headers[AUTH_TOKEN_HEADER_NAME] = Bearer(key ?? pk())
	fetch(`${API_URI}/${apiRoute.setColor}`, {
		method: "POST",
		body: color,
		headers
	})
}
function setText(text: string, key?: string) {
	localStorage.setItem('text', text)
	const headers = {}
	headers[AUTH_TOKEN_HEADER_NAME] = Bearer(key ?? pk())
	fetch(`${API_URI}/${apiRoute.setText}`, {
		method: "POST",
		body: text,
		headers
	})
}
