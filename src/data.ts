import { API_URI } from "./API_URI";
import type { ApiRoute, AuthTokenName, Connection, SSEvent } from "../server/api";
import { createSignal } from "solid-js";

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	setColor: "setColor",
	setText: "setText",
	clear: "clear"
};
const sse: { [Property in SSEvent]: Property } = {
	pk: "pk",
	id: "id",
	connections: "connections",
	reconnect: "reconnect"
}
const AUTH_TOKEN_HEADER_NAME: AuthTokenName = "Authorization"

type Stats = {
	online: number;
	offline: number;
}

const [connections, setConnections] = createSignal<Connection[]>([])
const [id, setId] = createSignal("")
const [pk, setPk] = createSignal(localStorage.getItem(AUTH_TOKEN_HEADER_NAME))
const [serverOnline, setServerOnline] = createSignal(false)
const [stats, setStats] = createSignal<Stats>()

export default { id, pk, connections, stats, serverOnline, setColor, setText }

initSSE(`${API_URI}/${apiRoute.sse}`, pk())

async function initSSE(route: string, token: string) {
	while (true) {
		try {
			const headers = new Headers()
			headers.set('Content-Type', 'text/event-stream')
			if (token) headers.set(AUTH_TOKEN_HEADER_NAME, token)
			const response = await fetch(route, { method: 'GET', headers })
			const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
			setServerOnline(true)

			while (true) {
				const { value, done } = await reader.read()
				if (done) break

				const events = parseEventStream(value)
				events.forEach(event => handleSseEvent(event))
			}
		} catch (error) {
			setServerOnline(false)
			await new Promise<void>(resolve => setTimeout(() => resolve(), 3000))
			console.error('SSE', error || 'reconnect...')
		}
	}
}

type SSEventPayload = {
	event?: string;
	data?: string;
	id?: string;
	retry?: string;
}
const payload: { [Property in Required<keyof SSEventPayload>]: Property } = {
	id: "id",
	data: "data",
	retry: "retry",
	event: "event"
}

function parseEventStream(value: string) {
	//https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
	return value.split('\r\n\r\n')
		.filter(e => e)
		.map(s => s.split('\r\n'))
		.map((event): SSEventPayload => ({
			[payload.event]: event[0].split(`${payload.event}: `)[1],
			[payload.data]: event[1].split(`${payload.data}: `)[1]
		}))
}

function handleSseEvent(event: SSEventPayload) {
	switch (event.event) {
		case sse.pk:
			const key = event.data
			setPk(key);
			localStorage.setItem(AUTH_TOKEN_HEADER_NAME, key)
			console.log(`${event.event}`, key);

			const prevColor = localStorage.getItem('color')
			if (prevColor) setColor(prevColor, key)

			const prevText = localStorage.getItem('text')
			if (prevText) setText(prevText, key)

			break;
		case sse.id:
			setId(event.data);
			console.log(`${event.event}`, event.data);
			break;
		case sse.connections:
			const data = JSON.parse(event.data) as Connection[]
			setConnections(data);
			setStats({
				online: data.reduce((total, conn) => total += (conn.status === "online" ? 1 : 0), 0),
				offline: data.reduce((total, conn) => total += (conn.status !== "online" ? 1 : 0), 0)
			})
			console.log(`${event.event}`, data);
			break;
		case sse.reconnect:
			throw "reconnect requested by server"
		default:
			console.warn(`Unknown SSE field "${event.event}"`, event.data)
			break;
	}
}

async function setColor(color: string, key?: string) {
	const headers = {}
	headers[AUTH_TOKEN_HEADER_NAME] = key ?? pk()
	const response = await fetch(`${API_URI}/${apiRoute.setColor}`, {
		method: "POST",
		body: color,
		headers
	})
	if (response.ok)
		localStorage.setItem('color', color)

}
async function setText(text: string, key?: string) {
	const headers = {}
	headers[AUTH_TOKEN_HEADER_NAME] = key ?? pk()
	const response = await fetch(`${API_URI}/${apiRoute.setText}`, {
		method: "POST",
		body: text,
		headers
	})
	if (response.ok)
		localStorage.setItem('text', text)

}
