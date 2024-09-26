import { API_URI } from "./API_URI";
import type { ApiRoute, Connection, SSEvent } from "../server/api";
import { createSignal } from "solid-js";

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	setColor: "setColor",
	setText: "setText"
};
const sse: { [Property in SSEvent]: Property} = {
	pk: "pk",
	id: "id",
	connections: "connections"
}
const AUTH_TOKEN_HEADER_NAME = sse.pk

const [connections, setConnections] = createSignal<Connection[]>([])
const [id, setId] = createSignal<number>(undefined)
const [pk, setPk] = createSignal("")

export default { id, connections, setColor, setText }


// https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
const eventStream = new EventSource(`${API_URI}/${apiRoute.sse}`);
eventStream.addEventListener(sse.connections, (event) => {
	const data = JSON.parse(event.data) as Connection[]
	setConnections(data)
});
eventStream.addEventListener(sse.pk, (event) => {
	const key = event.data
	setPk(key)
	
	const prevColor = localStorage.getItem('color')
	if(prevColor) setColor(prevColor, key)
		
	const prevText = localStorage.getItem('text')
	if(prevText) setText(prevText, key)
});
eventStream.addEventListener(sse.id, (event) => {
	setId(event.data)
});

function setColor(color: string, key?: string) {
	localStorage.setItem('color', color)
	const headers = {}
	headers[AUTH_TOKEN_HEADER_NAME] = key ?? pk()
	fetch(`${API_URI}/${apiRoute.setColor}`, {
		method: "POST",
		body: color,
		headers
	})
}
function setText(text: string, key?: string) {
	localStorage.setItem('text', text)
	const headers = {}
	headers[AUTH_TOKEN_HEADER_NAME] = key ?? pk()
	fetch(`${API_URI}/${apiRoute.setText}`, {
		method: "POST",
		body: text,
		headers
	})
}
