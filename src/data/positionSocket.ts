import { Connection, Position, PositionMessage, PositionMessageHandler, QuaternionTuple } from "../../server/types"
import { API_URI } from "../API_URI"
import { pk, selfConnection } from "./data"
import { apiRoute } from "./http"

let socket: WebSocket
const handlers: PositionMessageHandler[] = []

let retries = 0
const interval = 500
const maxInterval = 15000

export async function connectSocket() {
	
	const uuid = pk()
	
	if(!uuid) throw new Error(`failed to get UUID from pk()`)

	socket = new WebSocket(`${API_URI}/${apiRoute.position}`);
	socket.onopen = () => {
		socket.send(uuid) //auth by sending UUID as first message
		console.log(`position socket connected`, `${retries} retries`, uuid)
		retries = 0
	}

	//reconnect on close!
	socket.addEventListener('close', async (ev: CloseEvent) => {
		console.log(`position socket closed`, uuid, ev.code, ev.reason)

		if (retries * interval < maxInterval)
			retries++

		const timeout = retries * interval

		console.log('position socket waiting', `${timeout}ms`)

		await new Promise<void>(resolve => setTimeout(() => resolve(), timeout))
		connectSocket()
	})

	//reconnect any old handlers
	handlers.forEach(h => onGotPosition(h))
}

export function broadcastPosition(position: Position, quaternion?: QuaternionTuple) {
	//TODO: queue up this broadcast to be sent when we're ready
	if(socket.readyState != WebSocket.OPEN) 
		return false

	const message = { position, quaternion }
	socket.send(JSON.stringify(message, (key, value) => {
		//reduce precision so we send less data
		if(typeof value === 'number') 
			return Number(value.toPrecision(6)) 
		return value
	}))
	return true
}

export function onGotPosition(handler: PositionMessageHandler) {
	if(!socket) throw new Error(`socket is ${socket}`)
		
	handlers.push(handler) //save it for reconnection
	socket?.addEventListener('message', (ev) => {
		const message = JSON.parse(ev.data) as PositionMessage
		handler(message)
	})
}

