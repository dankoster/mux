
import { Show } from "solid-js";
import { render } from "solid-js/web";
import { GitHubSvg } from "./GitHubSvg";
import { onDistanceToAvatarChanged, Planet } from "./planet/planet";
import { Avatar } from './planet/avatar';
import Settings from "./Settings";
import * as server from "./data/data";
import VideoCall, * as videoCall from "./VideoCall";

import "./main.css"
import Welcome from "./Welcome";

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
			<Toolbar />
			<Settings />
		</Show>
	</>
}

function Toolbar() {
	return <div class="toolbar">
		<div class="stats">
			<h2 class="logo">⨳</h2>
			<div class="userCount"><b>{server.stats()?.online ?? "?"}</b> online 👀</div>
			<div class="userCount"><b>{server.stats()?.offline ?? "?"}</b> offline 😴</div>
		</div>

		<div class="user">

			<Show when={!server.self()?.identity}>
				<a class="room-button" href={server.githubAuthUrl()?.toString()}>
					<GitHubSvg />login
				</a>
			</Show>
			<Show when={server.self()?.identity}>
				<videoCall.VideoCallToolbar />
			</Show>
		</div>
	</div>
}
