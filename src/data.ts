import { API_URI } from "./API_URI";
import type { ApiRoute, AuthTokenName, Connection, Room, SSEvent, Update } from "../server/api";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store"

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	dm: "dm",
	setColor: "setColor",
	setText: "setText",
	clear: "clear",
	discardKey: "discardKey",
	room: "room",
	"room/join": "room/join",
	"room/addOfferCandidate": "room/addOfferCandidate",
	"room/addAnswerCandidate": "room/addAnswerCandidate",
	"room/answerCall": "room/answerCall",
	"room/offerSessionDescription": "room/offerSessionDescription",
	"room/answerSessionDescription": "room/answerSessionDescription",
};

const sse: { [Property in SSEvent]: Property } = {
	pk: "pk",
	id: "id",
	dm: "dm",
	connections: "connections",
	reconnect: "reconnect",
	update: "update",
	new_connection: "new_connection",
	delete_connection: "delete_connection",
	rooms: "rooms",
	new_room: "new_room",
	delete_room: "delete_room",
	room_offerCandidateAdded: "room_offerCandidateAdded",
	room_sessionDescriptionAdded: "room_sessionDescriptionAdded",
	room_answerCandidateAdded: "room_answerCandidateAdded",
	room_remoteAnswered: "room_remoteAnswered",
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



export default {
	id, pk, connections, rooms, stats, serverOnline,
	setColor, setText, createRoom, exitRoom, joinRoom,
	setRoomSessionDescription, getRoomSessionDescription, addOfferCandidate, sendAnswer,
	onRemoteAnswered, onAnswerCandidateAdded, onOfferCandidateAdded, addAnswerCandidate,
	onSessionDescriptionAdded, sendDM, onDM
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

			while (true) {
				const { value, done } = await reader.read()
				if (done) break

				const events = parseEventStream(value)
				events.forEach(event => handleSseEvent(event))
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

async function createRoom() {
	return await POST(apiRoute.room)
}
async function setRoomSessionDescription(sessionDesc: RTCSessionDescriptionInit) {
	return await POST(apiRoute["room/offerSessionDescription"], { body: JSON.stringify(sessionDesc) })
}
async function getRoomSessionDescription(): Promise<RTCSessionDescriptionInit> {
	const response = await GET(apiRoute["room/offerSessionDescription"])
	try {
		const result = await response.json()
		return result as RTCSessionDescriptionInit
	} catch (error) {
		if (error?.message === 'Unexpected end of JSON input') {
			console.warn(error)
			return
		}
		else throw error
	}
}
async function getAnswerSessionDescription(): Promise<RTCSessionDescriptionInit> {
	const response = await GET(apiRoute["room/answerSessionDescription"])
	try {
		const result = await response.json()
		return result as RTCSessionDescriptionInit
	} catch (error) {
		if (error?.message === 'Unexpected end of JSON input') {
			console.warn(error)
			return
		}
		else throw error
	}
}
async function sendAnswer(answer: RTCSessionDescriptionInit) {
	return await POST(apiRoute["room/answerCall"], { body: JSON.stringify(answer) })
}
async function addOfferCandidate(offer: RTCIceCandidate) {
	return await POST(apiRoute["room/addOfferCandidate"], { body: JSON.stringify(offer.toJSON()) })
}
async function addAnswerCandidate(answer: RTCIceCandidate) {
	return await POST(apiRoute["room/addAnswerCandidate"], { body: JSON.stringify(answer.toJSON()) })
}
async function joinRoom(roomId: string) {
	return await POST(apiRoute["room/join"], { subRoute: roomId })
}
async function exitRoom(roomId: string) {
	return await DELETE(apiRoute.room, roomId)
}

function parseEventStream(value: string) {
	//https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
	const result = value.split('\r\n\r\n')
		.filter(e => e)
		.map(s => s.split('\r\n'))
		.map((event): SSEventPayload => ({
			[payload.event]: event[0]?.split(`${payload.event}: `)[1] as SSEvent,
			[payload.data]: event[1]?.split(`${payload.data}: `)[1]
		}))

	result.forEach(output => console.assert(!!output.event, {value, result, e: output}))

	return result
}

class SSEventEmitter extends EventTarget {
	onSseEvent(event: SSEvent, value: string) {
		this.dispatchEvent(new CustomEvent(event, { detail: value }))
	}
}
const SSEvents = new SSEventEmitter()

function onDM(callback: (dm: { senderId: string, message: string }) => void) {
	SSEvents.addEventListener(sse.dm, async (e: CustomEvent) => {
		callback(JSON.parse(e.detail))
	})
}
function onRemoteAnswered(callback: (answer: RTCSessionDescription) => void) {
	SSEvents.addEventListener(sse.room_remoteAnswered, async (e: CustomEvent) => {
		try {
			const answerDescription = new RTCSessionDescription(JSON.parse(e.detail))
			callback(answerDescription)
		} catch (err) {
			if (err.message?.startsWith("Unterminated string in JSON")) {
				console.warn(err.message)
				//The session description was too long for sse, I guess?
				console.log('making an explicit request for truncated session description...')
				const init = await getAnswerSessionDescription()
				const session = new RTCSessionDescription(init)
				callback(session)
			} else {
				console.log(err.message, e.detail)
				debugger
			}
		}
	})
}
function onAnswerCandidateAdded(callback: (candidate: RTCIceCandidate) => void) {
	SSEvents.addEventListener(sse.room_answerCandidateAdded, (e: CustomEvent) => {
		try {
			const candidate = new RTCIceCandidate(JSON.parse(e.detail))
			callback(candidate)
		} catch (err) {
			console.log(err.message, e.detail)
			debugger
		}
	})
}
function onOfferCandidateAdded(callback: (candidate: RTCIceCandidate) => void) {
	SSEvents.addEventListener(sse.room_offerCandidateAdded, (e: CustomEvent) => {
		try {
			const candidate = new RTCIceCandidate(JSON.parse(e.detail))
			callback(candidate)
		} catch (err) {
			console.log(err.message, e.detail)
			debugger
		}
	})
}

function onSessionDescriptionAdded(callback: (session: RTCSessionDescription) => void) {
	SSEvents.addEventListener(sse.room_sessionDescriptionAdded, async (e: CustomEvent) => {
		try {
			const session = new RTCSessionDescription(JSON.parse(e.detail))
			callback(session)
		} catch (err) {
			if (err.message?.startsWith("Unterminated string in JSON")) {
				console.warn(err.message)
				//The session description was too long for sse, I guess?
				console.log('making an explicit request for truncated session description...')
				const init = await getRoomSessionDescription()
				const session = new RTCSessionDescription(init)
				callback(session)
			} else {
				console.log(err.message, e.detail)
				debugger
			}
		}
	})
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
		case sse.room_sessionDescriptionAdded:
		case sse.room_offerCandidateAdded:
		case sse.room_answerCandidateAdded:
		case sse.room_remoteAnswered:
		case sse.dm:
			// console.log('SSE', event.event, event.data)
			SSEvents.onSseEvent(event.event, event.data)
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

function sendDM(userId: string, message: string) {
	return POST(apiRoute.dm, { subRoute: userId, body: message })
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