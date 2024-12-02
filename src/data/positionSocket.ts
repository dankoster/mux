import { API_URI } from "../API_URI"
import { id, pk } from "./data"
import { apiRoute } from "./http"

type xyz = {x:number, y: number, z: number}
type PositionMessage = {id: string, position: xyz}
type PositionMessageHandler = (message: PositionMessage) => void

let ws: WebSocket
const handlers: PositionMessageHandler[] = []

connectSocket()
function connectSocket() {
	console.log('connecting websocket!')
	const socket = new WebSocket(`${API_URI}/${apiRoute.ws}`);
	socket.onopen = () => {
		socket.send(pk()) //auth by sending UUID as first message
		console.log("WS - Connected to server")
	}

	//reconnect on close!
	socket.addEventListener('close', connectSocket)

	//reconnect any old handlers
	handlers.forEach(h => onGotPosition(h))

	ws = socket
}

export function broadcastPosition(position: xyz) {

	//TODO: queue up this broadcast to be sent when we're ready
	if(!id() || ws.readyState != 1) 
		return false

	const message: PositionMessage = {
		id: id(),
		position
	}
	//console.log('broadcastPosition', message)
	ws.send(JSON.stringify(message))
	return true
}

export function onGotPosition(handler: PositionMessageHandler) {
	handlers.push(handler) //save it for reconnection
	ws.addEventListener('message', (ev) => {
		const message = JSON.parse(ev.data) as PositionMessage
		handler(message)
	})
}

