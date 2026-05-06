import { API_URI } from "../API_URI";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store"
import type { SSEvent, AuthTokenName, Connection, Update, FriendRequest, Friend, DM, DMRequest, EncryptedMessage, initiateCallResult, AreaNotification, Position, SSEventPayload } from "../../server/types";
import { apiRoute, DELETE, GET, POST } from "./http";
import { AreaParams, } from "../planet/area";
import * as Planet from "../planet/planet";
import { uiLog } from "../uiLog";
import * as DirectMessages from "./directMessages";
import * as PositionSocket from "./positionSocket";
import { AddPalm } from "../planet/palm";

const sse: { [Property in SSEvent]: Property } = {
	webRTC: "webRTC",
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
	initiateCall: "initiateCall",
	addArea: "addArea",
	removeArea: "removeArea",
	grabArea: "grabArea",
	releaseArea: "releaseArea"
}

export const AUTH_TOKEN_HEADER_NAME: AuthTokenName = "Authorization"

type Stats = {
	online: number;
	offline: number;
}



const [connections, setConnections] = createStore<Connection[]>([])
const [friendRequests, setFriendRequests] = createStore<FriendRequest[]>([])
const [friends, setFriends] = createStore<Friend[]>([])
const [id, setId] = createSignal("")
const [self, setSelf] = createSignal<Connection>()
const [pk, setPk] = createSignal(localStorage.getItem(AUTH_TOKEN_HEADER_NAME))
const [serverOnline, setServerOnline] = createSignal(false)
const [stats, setStats] = createSignal<Stats>()

let resolvePromiseToGetSelfConnection: (con: Connection) => void
export const selfConnection = new Promise<Connection>((resolve) => resolvePromiseToGetSelfConnection = resolve)
export {
	pk, connections, self, stats, serverOnline, friendRequests, friends
}

export function isSelf(con: Connection) {
	return con.identity && con.identity?.id === self().identity?.id
}

type AuthData = {
	uuid: string,
	self: Connection
}

function parseJsonDeep(obj) {
	switch (typeof (obj)) {
		case 'object':
			for (const prop in obj) {
				const result = parseJsonDeep(obj[prop])
				obj[prop] = result
			}
			break
		case 'string':
			try {
				return JSON.parse(obj)
			} catch {
				return obj
			}
	}
	return obj
}

startup()
async function startup() {
	console.log(`data pipeline startup`)

	const authResult = await POST(apiRoute.auth)
	const authJson = await authResult.json() as AuthData
	console.log(`auth`, authJson.uuid, authJson.self?.id, authJson.self.identity?.name)

	if (!authJson.uuid) throw new Error(`auth failed to get uuid`)
	if (!authJson.self) throw new Error(`auth failed to get self`)

	setPk(authJson.uuid)

	const oldKey = localStorage.getItem(AUTH_TOKEN_HEADER_NAME)
	localStorage.setItem(AUTH_TOKEN_HEADER_NAME, authJson.uuid)
	if (oldKey && oldKey !== authJson.uuid) {
		console.log(apiRoute.discardKey, { newKey: authJson.uuid, oldKey });
		POST(apiRoute.discardKey, { subRoute: oldKey })
	}

	const connectionsResult = await GET(apiRoute.connections)
	const connectionsData = await connectionsResult.json() as Connection[]
	console.log(`got ${connectionsData?.length} connections`)
	connectionsData.forEach(con => {
		con.position = parseJsonDeep(con.position)
		con.quaternion = parseJsonDeep(con.quaternion)
	})
	setConnections(connectionsData)
	onConnectionsChanged()

	const con = connections.find(c => c.id == authJson.self.id)
	if (!con) throw new Error(`failed to find self connection ${authJson.self.id}`)

	con.position = parseJsonDeep(con.position)
	con.quaternion = parseJsonDeep(con.quaternion)

	setSelf(con)
	resolvePromiseToGetSelfConnection(con)

	initSSE(`${API_URI}/${apiRoute.sse}`).then(res => {
		if (res.status == 401) //not authorized
			location.reload()
	})

	PositionSocket.connectSocket()


}

export async function loadAreas() {
	const areas = await (await GET(apiRoute.area))?.json()
	areas.forEach((a: { position: string; }) => a.position = JSON.parse(a.position))
	return areas
}


async function initSSE(route: string): Promise<Response> {
	let retries = 0
	const interval = 500
	const maxInterval = 15000
	while (true) {
		try {
			const uuid = pk()
			console.log(`init sse`, uuid)
			const headers = new Headers()
			headers.set('Content-Type', 'text/event-stream')
			if (uuid) headers.set(AUTH_TOKEN_HEADER_NAME, uuid)
			const response = await fetch(route, { method: 'GET', headers })

			if (!response.ok) {
				console.log(`SSE not ok!`, response)
				return response
			}

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
				events.forEach((event: SSEventPayload) => sseHandlers[event.event]?.forEach(handler => handler(event)))
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

export const addArea = (area: AreaParams) => POST(apiRoute.area, { body: JSON.stringify(area) })
export const removeArea = (uuid: string) => DELETE(apiRoute.area, uuid)
export const grabArea = (uuid: string) => POST(apiRoute.grabArea, { body: uuid })
export const releaseArea = (message: AreaNotification) => POST(apiRoute.releaseArea, { body: JSON.stringify(message) })

export async function initiateCall(conId: string): Promise<initiateCallResult> {
	var result = (await POST(apiRoute.initiateCall, { body: conId }))
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

const sseHandlers: {[key:string]:[(payload: SSEventPayload)=>void]} = {}
export function addServerSentEventHandler(event: SSEvent, handler: (payload: SSEventPayload) => void) {
	if(!Array.isArray(sseHandlers[event])) 
		sseHandlers[event] = [handler]
	else
		sseHandlers[event].push(handler) 
	//console.trace(`Added handler for`, event)
}
export function removeServerSentEventHandler(event: SSEvent, handler: (payload: SSEventPayload) => void) {
	sseHandlers[event]?.splice(sseHandlers[event]?.indexOf(handler), 1)
	//console.trace(`Removed handler for`, event)
}

//TODO: convert this to a consumer driven strategy pattern (see above)
async function handleSseEvent(event: SSEventPayload) {
	switch (event.event) {
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
		case sse.new_connection:
			const newCon = JSON.parse(event.data) as Connection
			console.log('SSE', event.event, newCon)
			setConnections(connections.length, newCon)
			onConnectionsChanged()
			console.log(connections)
			break;
		case sse.delete_connection:
			const conId = JSON.parse(event.data)
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
			// getAllUnread(friends, connections)
			uiLog(`SSE ${event.event}: ${friendsList}`)
			//console.log('SSE', event.event, friends)
			break;

		case sse.dm:
			const dm = JSON.parse(event.data) as DM
			DirectMessages.handleNewDirectMessage(dm);
			break;

		case sse.addArea:
			const ap = JSON.parse(event.data) as AreaParams
			ap.fromServer = true
			AddPalm(ap);
			break;
		case sse.removeArea:
			Planet.removeArea(JSON.parse(event.data))
			break;

		case sse.webRTC:
			break;
		case sse.grabArea:
		case sse.releaseArea:
		case sse.initiateCall:
			console.log("SSE", event)
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
	const me = self()
	if (!me) return

	connections.forEach(con => {
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
			DirectMessages.sharePrivateKey(me.id, con)
		}
	})

	const online = connections.filter(c => c.status == "online").length
	const total = connections.length
	setStats({ online, offline: total - online });
}

export async function setColor(color: string, key?: string) {
	return await POST(apiRoute.setColor, { body: color, authToken: key })
}
