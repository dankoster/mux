
import { onMount, Show } from "solid-js";
import { render } from "solid-js/web";
import { GitHubSvg } from "./GitHubSvg";
import { Avatar, Planet } from "./planet";
import { MediaButton } from "./component/MediaButton";
import { FigmentMenu, MenuItem } from "./Menu";
import Settings, { ShowSettings } from "./Settings";
import * as server from "./data/data";
import VideoCall, * as videoCall from "./VideoCall";

import "./main.css"

render(() => <App />, document.body)

function handleDistanceChange(avatar: Avatar) {
	const proxRange = 3
	if (avatar.prevDistance > proxRange && avatar.distance < proxRange) {
		videoCall.ConnectVideo(avatar.connection?.id, false)
	}
	else if (avatar.prevDistance < proxRange && avatar.distance > proxRange) {
		videoCall.DisconnectVideo(avatar.connection?.id)
	}
}

function App() {

	return <>
		<meta name="theme-color" content="#1f0e3c"></meta>
		<Show when={!server.serverOnline()}>
			<div class="offlineMessage">⨳ connecting...</div>
		</Show>
		<Show when={server.serverOnline()}>

			<VideoCall />
			<Planet onDistanceChanged={handleDistanceChange} />

			<div class="toolbar">
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
						<VideoCallToolbar />
					</Show>

				</div>
			</div>
		</Show>
		<Settings />
	</>
};

function VideoCallToolbar() {
	const userClicked = (e: MouseEvent) => {
		menu.Clear()
		menu.AddItem(new MenuItem({
			text: `Chat`,
			subtext: 'coming soon...'
		}))
		menu.AddItem(new MenuItem({
			text: `Map`,
			subtext: 'coming soon...'
		}))
		menu.AddItem(new MenuItem({
			text: `Build`,
			subtext: 'coming soon...'
		}))
		menu.AddItem(new MenuItem({
			text: `Share`,
			subtext: 'coming soon...'
		}))
		menu.AddItem(new MenuItem({
			text: `Find`,
			subtext: 'coming soon...'
		}))

		menu.AddSeparator()
		menu.AddItem(new MenuItem({
			text: `Settings`,
			onTextClick: () => {
				ShowSettings()
				menu.Clear()
			}
		}))
		menu.AddSeparator()
		menu.AddItem(new MenuItem({
			text: `Logout ${server.self().identity.name}`,
			onTextClick: () => server.becomeAnonymous(),
		}))
		menu.ShowFor((e.target as HTMLElement).parentElement)
	}

	let menu: FigmentMenu
	onMount(() => {
		menu = FigmentMenu.Create({ extraClasses: 'menu-keep-open' }) as FigmentMenu
	})

	return <div class="avatar button">
		<img alt={server.self()?.identity?.name} src={server.self()?.identity.avatar_url} onclick={userClicked} />
		<div class="name" onclick={userClicked}>{server.self()?.identity.name}</div>

		<MediaButton
			className="audio"
			enabled={videoCall.micEnabled}
			onClick={() => videoCall.toggleMic()}
			enabledIcon="microphone"
			disabledIcon="microphone_muted"
		/>
		<MediaButton
			className="video"
			enabled={videoCall.camEnabled}
			onClick={() => videoCall.toggleVideo()}
			enabledIcon="camera"
			disabledIcon="camera_muted"
		/>
		{/* <div class={`screen`} onclick={videoCall.toggleScreenShare}>
			<SvgIcon icon={'share_screen'} />
		</div> */}
	</div>
}
