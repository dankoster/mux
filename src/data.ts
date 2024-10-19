import { API_URI } from "./API_URI";
import type { ApiRoute, AuthTokenName, Connection, Room, SSEvent, Update } from "../server/api";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store"

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	webRTC: "webRTC",
	setColor: "setColor",
	setText: "setText",
	clear: "clear",
	discardKey: "discardKey",
	room: "room",
	"room/join": "room/join",
};

const sse: { [Property in SSEvent]: Property } = {
	pk: "pk",
	id: "id",
	webRTC: "webRTC",
	connections: "connections",
	reconnect: "reconnect",
	update: "update",
	new_connection: "new_connection",
	delete_connection: "delete_connection",
	rooms: "rooms",
	new_room: "new_room",
	delete_room: "delete_room",
}

const AUTH_TOKEN_HEADER_NAME: AuthTokenName = "Authorization"

type Stats = {
	online: number;
	offline: number;
}

const [rooms, setRooms] = createStore<Room[]>([])
const [connections, setConnections] = createStore<Connection[]>([])
const [id, setId] = createSignal("")
const [pk, setPk] = createSignal(localStorage.getItem(AUTH_TOKEN_HEADER_NAME))
const [serverOnline, setServerOnline] = createSignal(false)
const [stats, setStats] = createSignal<Stats>()

export {
	id, pk, connections, rooms, stats, serverOnline
}

initSSE(`${API_URI}/${apiRoute.sse}`, pk())

async function initSSE(route: string, token: string) {
	let retries = 0
	const interval = 500
	const maxInterval = 15000
	while (true) {
		try {
			const headers = new Headers()
			headers.set('Content-Type', 'text/event-stream')
			if (token) headers.set(AUTH_TOKEN_HEADER_NAME, token)
			const response = await fetch(route, { method: 'GET', headers })
			const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
			setServerOnline(true)
			retries = 0

			//https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
			//PARTIAL READS HAPPEN!!!!!!! We could do a fancy iterator if there was a lot of data: 
			// https://developer.mozilla.org/en-US/docs/Web/API/ReadableStreamDefaultReader/read#example_2_-_handling_text_line_by_line
			// ...but this is small data, and HULK SMASH is easier to reason about. 

			let buffer = ""
			while (true) {
				const { value: chunk, done } = await reader.read()
				if (done) break

				buffer += chunk

				//split up the incoming message stream and account for partial reads
				const messages = buffer.split('\r\n\r\n')

				//keep everything since the last terminator
				//we expect the last item in messages to be '' if we got a final terminator
				//otherwise the last message will contain everything between the last terminator
				//and the end of the string
				buffer = messages.pop()

				//parse the messages into event objects
				const events = []
				while (messages.length) {
					const message = messages.shift()
					const event = message
						.split("\r\n") //split the lines apart
						.map(s => [s.slice(0, s.indexOf(': ')), s.slice(s.indexOf(': ') + 2)]) //split each line by the first ": "
						.reduce((out, cur) => { //convert those sub-arrays into an object like {[key:string]:string}
							out[cur[0]] = cur[1]
							return out
						}, {})

					events.push(event)
				}

				events.forEach(event => handleSseEvent(event as SSEventPayload))
			}
		} catch (error) {
			setServerOnline(false)
			if (retries * interval < maxInterval)
				retries++

			await new Promise<void>(resolve => setTimeout(() => resolve(), retries * interval))
			if ((error?.message ?? '') !== "Failed to fetch")
				console.error('SSE', error || 'reconnect...')
		}
	}
}

type SSEventPayload = {
	event: SSEvent;
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

export function githubAuthUrl() {
	//https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#web-application-flow
	
	//@ts-ignore 
	const client_id = import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID
	//@ts-ignore
	const redirect_uri = import.meta.env.VITE_GITHUB_OAUTH_REDIRECT_URI

	const url = new URL("https://github.com/login/oauth/authorize")
	url.searchParams.append('client_id', client_id)
	url.searchParams.append('redirect_uri', redirect_uri)
	url.searchParams.append('scope', 'read:user')
	url.searchParams.append('state', pk())
	url.searchParams.append('allow_signup', 'true')

	return url
}

export async function createRoom() {
	//TODO: optimistically create the room locally
	// so we can update the UI while we wait for the server
	return await POST(apiRoute.room)
}
export async function joinRoom(roomId: string) {
	return await POST(apiRoute["room/join"], { subRoute: roomId })
}
export async function exitRoom(roomId: string) {
	return await DELETE(apiRoute.room, roomId)
}

class SSEventEmitter extends EventTarget {
	onSseEvent(event: SSEvent, value: string | {}) {
		this.dispatchEvent(new CustomEvent(event, { detail: value }))
	}
}
const SSEvents = new SSEventEmitter()

export function onWebRtcMessage(callback: (message: { senderId: string, message: string }) => void) {
	const ac = new AbortController()
	SSEvents.addEventListener(sse.webRTC, async (e: CustomEvent) => {
		callback(e.detail)
	}, { signal: ac.signal })
	return ac
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

			const OLD_KEYS = `${AUTH_TOKEN_HEADER_NAME}History`
			const oldKeys = localStorage.getItem(OLD_KEYS)
			const updatedOldKeys = [newKey, oldKeys?.split(',') ?? '']
				.flat()
				.filter(k => k)
				.reduce((acc, cur) => {
					!acc.includes(cur) && acc.push(cur)
					return acc
				}, [])
				.join()
			localStorage.setItem(OLD_KEYS, updatedOldKeys)
			console.log('SSE', event.event, newKey, { history: updatedOldKeys.split(',') });
			break;
		case sse.id:
			setId(event.data);
			console.log('SSE', event.event, event.data);
			break;
		case sse.connections:
			const conData = JSON.parse(event.data) as Connection[]
			setConnections(conData);
			updateConnectionStatus()
			console.log('SSE', event.event, conData);
			break;
		case sse.rooms:
			const roomData = JSON.parse(event.data) as Room[]
			setRooms(roomData)
			console.log('SSE', event.event, roomData)
			break;
		case sse.reconnect:
			throw "reconnect requested by server"
		case sse.update:
			const update = JSON.parse(event.data) as Update
			console.log('SSE', event.event, update)
			const index = connections.findIndex(con => con.id === update.connectionId)
			if (!(index >= 0)) throw new Error('TODO: ask server for an updated list')
			//https://docs.solidjs.com/concepts/stores#range-specification
			setConnections({ from: index, to: index }, update.field, update.value)
			updateConnectionStatus()
			break;
		case sse.new_room:
			const newRoom = JSON.parse(event.data) as Room
			console.log('SSE', event.event, newRoom)
			setRooms(rooms.length, newRoom)
			break;
		case sse.webRTC:
			// console.log('SSE', event.event, event.data)
			try {
				const data = JSON.parse(event.data)
				SSEvents.onSseEvent(event.event, data)
			} catch (error) {
				console.error("Failed to parse webRTC event", event)
			}
			break;
		case sse.delete_room:
			const room = JSON.parse(event.data) as Room
			console.log('SSE', event.event, room)
			setRooms(rooms.filter(r => r.id !== room.id))
			break;
		case sse.new_connection:
			const newCon = JSON.parse(event.data) as Connection
			console.log('SSE', event.event, newCon)
			setConnections(connections.length, newCon)
			updateConnectionStatus()
			console.log(connections)
			break;
		case sse.delete_connection:
			const conId = event.data
			console.log('SSE', event.event, conId)
			setConnections(connections.filter(con => con.id !== conId))
			updateConnectionStatus()
			break;
		default:
			console.warn(`Unknown SSE field "${event?.event}"`, event?.data)
			if (event?.event === undefined) {
				return
			}
			debugger
			const nope = (_: never): never => { throw new Error() }
			nope(event.event) //this will prevent unhandled cases
			break;
	}
}

export function sendWebRtcMessage(userId: string, message: string) {
	if (!userId) throw new Error(`${userId} is not a valid userId`)
	if (!message) throw new Error(`${message} is not a valid message`)
	return POST(apiRoute.webRTC, { subRoute: userId, body: message })
}

function updateConnectionStatus() {
	setStats({
		online: connections.reduce((total, conn) => total += (conn.status === "online" ? 1 : 0), 0),
		offline: connections.reduce((total, conn) => total += (conn.status !== "online" ? 1 : 0), 0)
	});
}

export async function setColor(color: string, key?: string) {
	return await POST(apiRoute.setColor, { body: color, authToken: key })
}
export async function setText(text: string, key?: string) {
	return await POST(apiRoute.setText, { body: text, authToken: key });
}

async function GET(route: ApiRoute) {
	const headers = {};
	headers[AUTH_TOKEN_HEADER_NAME] = pk();
	const url = [API_URI, route].filter(s => s).join('/')
	return await fetch(url, {
		method: "GET",
		headers
	});
}

type PostOptions = { subRoute?: string, body?: string, authToken?: string }
async function POST(route: ApiRoute, options?: PostOptions) {
	const headers = {};
	headers[AUTH_TOKEN_HEADER_NAME] = options?.authToken ?? pk();
	if (!route) throw new Error(`invalid route: ${route}`)
	const url = [API_URI, route, options?.subRoute].filter(s => s).join('/')
	return await fetch(url, {
		method: "POST",
		body: options?.body,
		headers
	});
}

async function DELETE(route: ApiRoute, subRoute: string) {
	const headers = {};
	headers[AUTH_TOKEN_HEADER_NAME] = pk();
	const url = [API_URI, route, subRoute].join('/')
	return await fetch(url, { method: "DELETE", headers });
}