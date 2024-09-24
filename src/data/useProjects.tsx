import { API_URI } from "./API_URI";
import type { ApiRoute } from "../../server/api";


const apiRoute: { [Property in ApiRoute]: Property } = {
	sse: "sse",
	projects: "projects"
};  

let projectsPromise;
type project = {
	id: number;
	name: string;
	desc: string;
	url: string;
	repo: string;
};

// https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
const eventStream = new EventSource(`${API_URI}/${apiRoute.sse}`);
eventStream.onmessage = (event) => {
	//handle generic messages
	console.log([event.lastEventId, event.data].filter(s=>s).join(': '))
};


// export function useProjects() {
// 	const [projects, setProjects] = useState<project[]>();
// 	const [error, setError] = useState();
// 	const [loading, setLoading] = useState(true);
	
// 	useMemo(() => {
// 		eventStream.addEventListener("projects", (event) => {
// 			let newProjects = JSON.parse(event.data)
// 			setProjects(newProjects)
// 		});
// 	}, [])

// 	if (!projectsPromise) {
// 		projectsPromise = fetch(`${API_URI}/${apiRoute.projects}`)
// 			.then(response => {
// 				if (!response.ok)
// 					throw `HTTP-${response.status}: ${response.statusText}`;

// 				return response.json();
// 			});

// 	}
// 	if (!projects)
// 		projectsPromise
// 			.then(json => setProjects(json))
// 			.catch(error => setError(error))
// 			.finally(() => setLoading(false));

// 	return { projects, loading, error };
// }
