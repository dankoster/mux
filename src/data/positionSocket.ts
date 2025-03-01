import { Position, PositionMessage, PositionMessageHandler } from "../../server/types"
import { API_URI } from "../API_URI"
import { id, pk } from "./data"
import { apiRoute } from "./http"

let socket: WebSocket
const handlers: PositionMessageHandler[] = []

connectSocket()
function connectSocket() {
	socket = new WebSocket(`${API_URI}/${apiRoute.position}`);
	socket.onopen = () => {
		socket.send(pk()) //auth by sending UUID as first message
	}

	//reconnect on close!
	socket.addEventListener('close', connectSocket)

	//reconnect any old handlers
	handlers.forEach(h => onGotPosition(h))
}

export function broadcastPosition(position: Position) {

	//TODO: queue up this broadcast to be sent when we're ready
	if(!id() || socket.readyState != 1) 
		return false

	socket.send(JSON.stringify(position))
	return true
}

export function onGotPosition(handler: PositionMessageHandler) {
	handlers.push(handler) //save it for reconnection
	socket.addEventListener('message', (ev) => {
		const message = JSON.parse(ev.data) as PositionMessage
		handler(message)
	})
}

