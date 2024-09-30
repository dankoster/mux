import "./index.css"
import "./main.css"

import { For, Show } from "solid-js";
import { render } from "solid-js/web";
import server from "./data";
import { ConnectionPanel } from "./ConnectionPanel";

const App = () => {
	return <>
		<Show when={!server.serverOnline()}>
			<div class="offlineMessage">connecting...</div>
		</Show>
		<Show when={server.serverOnline()}>
			<div class="header">
				<h1 class="logo">⨳ MUX</h1>
				<div class="stats">
					<div class="userCount"><b>{server.stats()?.online ?? "?"}</b> online 👀</div>
					<div class="userCount"><b>{server.stats()?.offline ?? "?"}</b> offline 😴</div>
				</div>
			</div>
			<div class="connections">
				<For each={server.connections}>
					{(con)=><ConnectionPanel connection={con} showControls={con.id == server.id()} />}
				</For>
			</div>
		</Show>
	</>
};

render(() => <App />, document.getElementById("root"));
