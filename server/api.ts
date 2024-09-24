import { Router } from "jsr:@oak/oak@17/router";
import { cacheWatcher, cacheValue } from "./cacheWatcher.ts";
import { turso } from "./turso.ts";

export const api = new Router();

export type ApiRoute =
	"sse" |
	"projects";

const apiRoute: { [Property in ApiRoute]: `/${Property}` } = {
	sse: "/sse",
	projects: "/projects"
};

//https://deno.com/blog/deploy-streams
//https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format

function sseMessage(event: string, data?: string, id?: string) {
	const lines = [];
	if (event) lines.push(`event: ${event}`);
	if (id) lines.push(`id: ${id}`);
	if (data) lines.push(`data: ${data}`);
	lines.push('\r\n');
	const msg = lines.join('\r\n');
	return new TextEncoder().encode(msg);
}

const cache = {
	projects: new cacheValue("projects", ""),
};

api.get(apiRoute.sse, async (context) => {
	let onProjectsUpdated: cacheWatcher<string>;
	context.response.headers.append("Content-Type", "text/event-stream");
	context.response.body = new ReadableStream({
		start(controller) {
			onProjectsUpdated = (key, value) => controller.enqueue(sseMessage(key, value));
			cache.projects.addWatcher(onProjectsUpdated);
		},
		cancel() {
			cache.projects.removeWatcher(onProjectsUpdated);
		},
	});
});

async function getProjects() {
	// const projects = await turso?.execute("SELECT * FROM project ORDER BY ID DESC");
	//return projects.rows;

	return { project: 'hello world' }
}

api.get(apiRoute.projects, async (context) => {
	if (cache.projects.value) {
		//send the cached value immediately
		context.response.body = cache.projects.value;

		//request new values and update the cache
		getProjects().then(projects => cache.projects.value = JSON.stringify(projects));
	}
	else {
		const projects = JSON.stringify(await getProjects());
		context.response.body = projects;
		cache.projects.value = projects;
	}
});
