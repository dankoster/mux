import * as server from "./data/data";


export function ServerStats() {
	return <div class="server-stats">
		<h2 class="logo">⨳</h2>
		<div class="userCount"><b>{server.stats()?.online ?? "?"}</b> online 👀</div>
		<div class="userCount"><b>{server.stats()?.offline ?? "?"}</b> offline 😴</div>
	</div>;
}
