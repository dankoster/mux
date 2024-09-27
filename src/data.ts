import { API_URI } from "./API_URI";
import type { ApiRoute, AuthTokenName, Connection, SSEvent } from "../server/api";
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
const AUTH_TOKEN_HEADER_NAME:AuthTokenName = "Authorization"

const [connections, setConnections] = createSignal<Connection[]>([])
const [id, setId] = createSignal("")
const [pk, setPk] = createSignal(localStorage.getItem(AUTH_TOKEN_HEADER_NAME))

export default { id, connections, setColor, setText }

 
initSSE(`${API_URI}/${apiRoute.sse}`, pk())

async function initSSE(route: string, token: string) {
	const headers = new Headers()
	headers.set('Content-Type', 'text/event-stream')
	if(token) headers.set(AUTH_TOKEN_HEADER_NAME, token)
	const response = await fetch(route, { method: 'GET', headers })
	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()

	while (true) {
		const { value, done } = await reader.read()
		if (done) break

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
			localStorage.setItem(AUTH_TOKEN_HEADER_NAME, event.data)
			console.log(`${event.event}`, event.data);

			// 	const prevColor = localStorage.getItem('color')
			// 	if(prevColor) setColor(prevColor, key)

			// 	const prevText = localStorage.getItem('text')
			// 	if(prevText) setText(prevText, key)

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

function setColor(color: string, key?: string) {
	localStorage.setItem('color', color)
	const headers = {}
	headers[AUTH_TOKEN_HEADER_NAME] = key ?? pk()
	fetch(`${API_URI}/${apiRoute.setColor}`, {
		method: "POST",
		body: color,
		headers
	})
}
function setText(text: string, key?: string) {
	localStorage.setItem('text', text)
	const headers = {}
	headers[AUTH_TOKEN_HEADER_NAME] = key ?? pk()
	fetch(`${API_URI}/${apiRoute.setText}`, {
		method: "POST",
		body: text,
		headers
	})
}
