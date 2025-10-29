import { API_URI } from "../API_URI";
import { createEffect, createSignal } from "solid-js";
import { createStore } from "solid-js/store"
import type { SSEvent, AuthTokenName, Connection, Update, FriendRequest, Friend, DM, DMRequest, EncryptedMessage, initiateCallResult } from "../../server/types";
import { apiRoute, POST } from "./http";
import { handleNewDirectMessage, getAllUnread, sharePrivateKey } from "./directMessages";
import { AreaParams, } from "../planet/area";
import * as Planet from "../planet/planet";

const sse: { [Property in SSEvent]: Property } = {
	pk: "pk",
	id: "id",
	webRTC: "webRTC",
	connections: "connections",
	refresh: "refresh",
	reconnect: "reconnect",
	update: "update",
	new_connection: "new_connection",
	delete_connection: "delete_connection",
	friendRequest: "friendRequest",
	friendList: "friendList",
	friendRequests: "friendRequests",
	friendRequestAccepted: "friendRequestAccepted",
	dm: "dm",
	broadcastJson: "broadcastJson"
}

export const AUTH_TOKEN_HEADER_NAME: AuthTokenName = "Authorization"

type Stats = {
	online: number;
	offline: number;
}

type SSEventPayload = {
	event: SSEvent;
	data?: string;
	id?: string;
	retry?: string;
}


const [connections, setConnections] = createStore<Connection[]>([])
const [friendRequests, setFriendRequests] = createStore<FriendRequest[]>([])
const [friends, setFriends] = createStore<Friend[]>([])
const [id, setId] = createSignal("")
const [self, setSelf] = createSignal<Connection>()
const [pk, setPk] = createSignal(localStorage.getItem(AUTH_TOKEN_HEADER_NAME))
const [serverOnline, setServerOnline] = createSignal(false)
const [stats, setStats] = createSignal<Stats>()

export {
	id, pk, connections, self, stats, serverOnline, friendRequests, friends
}

let resolvePromiseToGetSelfConnection: (con: Connection) => void
export const selfConnection = new Promise<Connection>((resolve) => resolvePromiseToGetSelfConnection = resolve)
createEffect(() => {
	const value = self()
	if (value) {
		resolvePromiseToGetSelfConnection(value)
	}
})

export function isSelf(con: Connection) {
	return con.identity && con.identity?.id === self().identity?.id
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
	// url.searchParams.append('prompt', 'select_account')

	return url
}

type JsonMessage = {
	command: "addArea" | "removeArea",
	payload: any,
	sender?: string //set by the server
}

export async function broadcastJson(message: JsonMessage) {
	const json = JSON.stringify(message);
	console.log("broadcastJson", json)
	return await POST(apiRoute.broadcastJson, { body: json })
}

export async function initiateCall(con: Connection): Promise<initiateCallResult> {
	var result = (await POST(apiRoute.initiateCall, { body: con.id }))
	return await result.json() as initiateCallResult
}

export async function sendFriendRequest(con: Connection) {
	return await POST(apiRoute.friendRequest, { body: con.id })
}

export async function acceptFriendRequest(con: Connection) {
	if (!con.identity) throw new Error(`connection ${con.id} has no identity`)
	const fr = friendRequests.find(fr => fr.fromId === con.identity?.id)
	if (!fr) throw new Error(`friend request not found for connection with identity ${con.identity?.id}`)
	return await POST(apiRoute.acceptFriendRequest, { body: fr.id })
}

//dump my identity and require login to get it back
export async function becomeAnonymous() {
	const response = await POST(apiRoute.becomeAnonymous)
	if (response.ok) {
		const myId = id()
		const index = connections.findIndex(con => con.id === myId)
		if (!(index >= 0)) {
			console.log('no identity to remove')
			return
		}
		setConnections({ from: index, to: index }, "identity", undefined)
		setFriends([])
		setFriendRequests([])
		
		//TODO: remove local storage
	}
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
			//console.log('SSE', event.event, newKey, { history: updatedOldKeys.split(',') });
			break;
		case sse.id:
			setId(event.data);
			if (id() && connections) setSelf(connections.find(con => con.id === event.data))
			//console.log('SSE', event.event, event.data);
			break;
		case sse.connections:
			const conData = JSON.parse(event.data) as Connection[]
			setConnections(conData)
			if (id() && connections) setSelf(connections.find(con => con.id === id()))
			onConnectionsChanged()
			//getAllUnread(friends, connections)
			//console.log('SSE', event.event, conData);
			break;
		case sse.reconnect:
			throw "reconnect requested by server"
		case sse.refresh:
			//console.log("REFRESH")
			location.reload()
			break;
		case sse.update:
			const update = JSON.parse(event.data) as Update
			//console.log('SSE', event.event, update)
			if (update.field === 'identity') {
				update.value = update.value && JSON.parse(update.value)
				console.log('parsed identity...', update.value || 'anonymous')
			}
			const index = connections.findIndex(con => con.id === update.connectionId)
			if (!(index >= 0)) throw new Error(`${update.connectionId} not found in connections`)
			//https://docs.solidjs.com/concepts/stores#range-specification
			setConnections({ from: index, to: index }, update.field, update.value)
			onConnectionsChanged()
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
		case sse.new_connection:
			const newCon = JSON.parse(event.data) as Connection
			console.log('SSE', event.event, newCon)
			setConnections(connections.length, newCon)
			onConnectionsChanged()
			console.log(connections)
			break;
		case sse.delete_connection:
			const conId = event.data
			console.log('SSE', event.event, conId)
			setConnections(connections.filter(con => con.id !== conId))
			onConnectionsChanged()
			break;
		case sse.friendRequest:
			const frenReq = JSON.parse(event.data)
			setFriendRequests(friendRequests.length, frenReq)
			console.log('SSE', event.event, frenReq)
			break;
		case sse.friendRequests:
			const frenReqList = JSON.parse(event.data)
			setFriendRequests(frenReqList)
			//console.log('SSE', event.event, frenReqList)
			break;
		case sse.friendRequestAccepted:
			const newFriend = JSON.parse(event.data) as Friend
			const acceptedFrenReq = friendRequests.find(
				fr => fr.fromId === newFriend.friendId || fr.toId === newFriend.friendId)
			setFriendRequests(friendRequests.filter(fr => fr.id !== acceptedFrenReq.id))
			setFriends(friends.length, newFriend)
			//console.log('SSE', event.event, { newFriend, acceptedFrenReq })
			break;
		case sse.friendList:
			const friendsList = JSON.parse(event.data) as Friend[]
			setFriends(friendsList)
			getAllUnread(friends, connections)
			//console.log('SSE', event.event, friends)
			break;

		case sse.dm:
			const dm = JSON.parse(event.data) as DM
			handleNewDirectMessage(dm);
			break;

		case sse.broadcastJson:
			const json = JSON.parse(event.data) as JsonMessage
			console.log(`SSE`, sse.broadcastJson, json)

			switch(json.command) {
				case "addArea":
					Planet.addArea(json.payload as AreaParams);
					break;
				case "removeArea":
					const ap = json.payload as AreaParams
					Planet.removeArea(ap.id)
					break;
				default: 
					throw `${json.command} not supported!`
			}
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

function onConnectionsChanged() {
	//do we have another connection with the same identity as myself?
	connections.forEach(con => {
		const me = self()
		if (me.identity &&
			con.id !== me.id &&
			con.status === 'online' &&
			con.identity &&
			con.identity.source === me.identity.source &&
			con.identity.id === me.identity.id
		) {
			const dateCreated = new Date(Number.parseInt(con.id))
			const kind = con.id === me.id ? "myself" : con.kind
			console.log(`Same identity: ${con.id} (${kind}) ${con.status} ${dateCreated.toLocaleString()}`)
			sharePrivateKey(me.id, con)
		}
	})

	setStats({
		online: connections.reduce((total, conn) => total += (conn.status === "online" ? 1 : 0), 0),
		offline: connections.reduce((total, conn) => total += (conn.status !== "online" ? 1 : 0), 0)
	});
}

export async function setColor(color: string, key?: string) {
	return await POST(apiRoute.setColor, { body: color, authToken: key })
}

export async function setText(text: string, key?: string) {
	return await POST(apiRoute.setText, { body: text, authToken: key })
}

