
import { Show } from "solid-js";
import { render } from "solid-js/web";
import { Planet } from "./planet/planet";
import Settings, { settingsVisible } from "./Settings";
import VideoCall, * as videoCall from "./VideoCall";
import * as server from "./data/data";

import "./main.css"
import Welcome, { welcomeVisible } from "./Welcome";
import { UserToolbar } from "./UserToolbar";
import ProximityWatcher from "./ProximityWatcher";

render(() => <App />, document.body)

function App() {
	return <>
		<meta name="theme-color" content="#1f0e3c"></meta>
		<Show when={!server.serverOnline()}>
			<div class="offlineMessage">⨳ connecting...</div>
		</Show>
		<Show when={server.serverOnline()}>
			<Welcome />
			<VideoCall />
			<Planet />
			<ProximityWatcher />
			<Show when={!welcomeVisible() && !settingsVisible()}>
				<UserToolbar />
			</Show>
			<Settings />
		</Show>
	</>
}
