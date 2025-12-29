import { Connection, Position, PositionMessage, PositionMessageHandler } from "../../server/types"
import { API_URI } from "../API_URI"
import { pk, selfConnection } from "./data"
import { apiRoute } from "./http"

let self: Connection
let socket: WebSocket
const handlers: PositionMessageHandler[] = []

connectSocket()
async function connectSocket() {
	self = await selfConnection

	const uuid = pk()
	if(!uuid) throw new Error(`failed to get UUID from pk()`)

	socket = new WebSocket(`${API_URI}/${apiRoute.position}`);
	socket.onopen = () => {
		socket.send(uuid) //auth by sending UUID as first message
	}

	//reconnect on close!
	socket.addEventListener('close', connectSocket)

	//reconnect any old handlers
	handlers.forEach(h => onGotPosition(h))
}

export function broadcastPosition(position: Position) {
	//TODO: queue up this broadcast to be sent when we're ready
	if(!self || socket.readyState != WebSocket.OPEN) 
		return false

	socket.send(JSON.stringify(position))
	return true
}

export function onGotPosition(handler: PositionMessageHandler) {
	handlers.push(handler) //save it for reconnection
	socket?.addEventListener('message', (ev) => {
		const message = JSON.parse(ev.data) as PositionMessage
		handler(message)
	})
}

