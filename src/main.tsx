
import { Show } from "solid-js";
import { render } from "solid-js/web";
import { onDistanceToAvatarChanged, Planet } from "./planet/planet";
import { Avatar } from './planet/avatar';
import Settings from "./Settings";
import VideoCall, * as videoCall from "./VideoCall";
import * as server from "./data/data";

import "./main.css"
import Welcome, { welcomeVisible } from "./Welcome";
import { UserToolbar } from "./UserToolbar";

render(() => <App />, document.body)

onDistanceToAvatarChanged((avatar: Avatar) => {
	const proxRange = 3

	//approaching
	if (avatar.prevDistance > proxRange && avatar.distanceFromSelf < proxRange) {
		videoCall.ConnectVideo(avatar.connection?.id, false)
	}

	//leaving
	else if (avatar.prevDistance < proxRange && avatar.distanceFromSelf > proxRange) {
		videoCall.DisconnectVideo(avatar.connection?.id)
	}
})

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
			<Show when={!welcomeVisible()}>
				<UserToolbar />
			</Show>
			<Settings />
		</Show>
	</>
}
