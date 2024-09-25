import { API_URI } from "./API_URI";
import type { ApiRoute } from "../../server/api";
import { createSignal } from "solid-js";

const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	hello: "hello"
};

const [data, setData] = createSignal("");
const [dataError, setDataError] = createSignal("")
const [dataLoading, setDataLoading] = createSignal(false)
const [connections, setConnections] = createSignal<Array<string>>([])

export { data, dataError as error, dataLoading as loading, connections }


// https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
const eventStream = new EventSource(`${API_URI}/${apiRoute.sse}`);
eventStream.onmessage = (event) => {
	//handle generic messages
	console.log([event.lastEventId, event.data].filter(s => s).join(': '))
};
eventStream.addEventListener(apiRoute.sse, (event) => {
	setConnections(JSON.parse(event.data))
});

fetch(`${API_URI}/${apiRoute.hello}`)
	.then(response => {
		if (!response.ok)
			throw `HTTP-${response.status}: ${response.statusText}`;

		return response.json();
	})
	.then(json => {
		console.log(apiRoute.hello, json)
		setData(json.data)
		setDataLoading(false)
	})
	.catch(error => {
		setDataError(error)
		setDataLoading(false)
	})

