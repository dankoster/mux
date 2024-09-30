import { API_URI } from "./API_URI";
import type { ApiRoute, AuthTokenName, Connection, SSEvent, Update } from "../server/api";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store"

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	setColor: "setColor",
	setText: "setText",
	clear: "clear",
	discardKey: "discardKey"
};
const sse: { [Property in SSEvent]: Property } = {
	pk: "pk",
	id: "id",
	connections: "connections",
	reconnect: "reconnect",
	update: "update",
	new_connection: "new_connection",
	delete_connection: "delete_connection"
}
const AUTH_TOKEN_HEADER_NAME: AuthTokenName = "Authorization"

type Stats = {
	online: number;
	offline: number;
}

const [connections, setConnections] = createStore<Connection[]>([])
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
			[payload.event]: event[0]?.split(`${payload.event}: `)[1],
			[payload.data]: event[1]?.split(`${payload.data}: `)[1]
		}))
}

function handleSseEvent(event: SSEventPayload) {
	switch (event.event) {
		case sse.pk:
			const newKey = event.data
			setPk(newKey);
			const oldKey = localStorage.getItem(AUTH_TOKEN_HEADER_NAME)
			if (oldKey && oldKey !== newKey) {
				//oh hey, I had this old bearer token but 
				// I'll use the new one instead so go ahead
				// and cleanup that old trash kthxbye
				console.log(apiRoute.discardKey, { newKey, oldKey });
				POST(apiRoute.discardKey, { subRoute: oldKey })
			}

			localStorage.setItem(AUTH_TOKEN_HEADER_NAME, newKey)
			console.log(event.event, newKey);
			break;
		case sse.id:
			setId(event.data);
			console.log(event.event, event.data);
			break;
		case sse.connections:
			const data = JSON.parse(event.data) as Connection[]
			setConnections(data);
			updateConnectionStatus()
			console.log(event.event, data);
			break;
		case sse.reconnect:
			throw "reconnect requested by server"
		case sse.update:
			const update = JSON.parse(event.data) as Update
			console.log(event.event, update)
			const index = connections.findIndex(con => con.id === update.connectionId)
			if (!(index >= 0)) throw new Error('TODO: ask server for an updated list')
			//https://docs.solidjs.com/concepts/stores#range-specification
			setConnections({ from: index, to: index }, update.field, update.value)
			updateConnectionStatus()
			break;
		case sse.new_connection:
			const new_connection = JSON.parse(event.data) as Connection
			console.log(event.event, new_connection)
			setConnections(connections.length, new_connection)
			updateConnectionStatus()
			console.log(connections)
			break;
		case sse.delete_connection:
			const conId = event.data
			console.log(event.event, conId)
			setConnections(connections.filter(con => con.id !== conId))
			updateConnectionStatus()
			break;
		default:
			debugger
			console.warn(`Unknown SSE field "${event.event}"`, event.data)
			break;
	}
}

function updateConnectionStatus() {
	setStats({
		online: connections.reduce((total, conn) => total += (conn.status === "online" ? 1 : 0), 0),
		offline: connections.reduce((total, conn) => total += (conn.status !== "online" ? 1 : 0), 0)
	});
}

async function setColor(color: string, key?: string) {
	return await POST(apiRoute.setColor, { body: color, authToken: key })
}
async function setText(text: string, key?: string) {
	return await POST(apiRoute.setText, { body: text, authToken: key });
}
type PostOptions = { subRoute?: string, body?: string, authToken?: string }
async function POST(route: ApiRoute, { subRoute, body, authToken }: PostOptions) {
	const headers = {};
	headers[AUTH_TOKEN_HEADER_NAME] = authToken ?? pk();
	const url = [API_URI, route, subRoute].filter(s => s).join('/')
	return await fetch(url, {
		method: "POST",
		body,
		headers
	});
}

