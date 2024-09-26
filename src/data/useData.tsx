import { API_URI } from "./API_URI";
import type { ApiRoute, Connection, SSEvent } from "../../server/api";
import { createSignal } from "solid-js";

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	setColor: "setColor"
};
const sse: { [Property in SSEvent]: Property} = {
	pk: "pk",
	id: "id",
	connections: "connections"
}

const [connections, setConnections] = createSignal<Connection[]>([])
const [id, setId] = createSignal<number>(undefined)
const [pk, setPk] = createSignal("")
export default { id, connections, setColor }


// https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
const eventStream = new EventSource(`${API_URI}/${apiRoute.sse}`);
eventStream.addEventListener(sse.connections, (event) => {
	const data = JSON.parse(event.data) as Connection[]
	setConnections(data)
});
eventStream.addEventListener(sse.pk, (event) => {
	setPk(event.data)
	const prevColor = localStorage.getItem('color')
	if(prevColor) setColor(prevColor, event.data)
});
eventStream.addEventListener(sse.id, (event) => {
	setId(event.data)
});

function setColor(color: string, key?: string) {
	localStorage.setItem('color', color)
	fetch(`${API_URI}/${apiRoute.setColor}`, {
		method: "POST",
		body: color,
		headers: {
			"pk": key ?? pk()
		}
	})
}
