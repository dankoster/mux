
import { Match, onMount, Show, Switch } from "solid-js";
import { render } from "solid-js/web";
import { GitHubSvg } from "./GitHubSvg";
import { Avatar, Planet } from "./planet";

import * as server from "./data/data";

import "./main.css"
import { FigmentMenu, MenuItem } from "./Menu";
import VideoCall, * as videoCall from "./VideoCall";
import { SvgIcon } from "./SvgIcon";
import Settings, { ShowSettings } from "./Settings";

type SelectedView = 'people' | 'planet'

render(() => <App />, document.body)

function App() {



	const onDistanceChanged = (avatar: Avatar) => {
		const proxRange = 3
		if (avatar.prevDistance > proxRange && avatar.distance < proxRange) {
			videoCall.ConnectVideo(avatar.connection?.id, false)
		}
		else if (avatar.prevDistance < proxRange && avatar.distance > proxRange) {
			videoCall.DisconnectVideo(avatar.connection?.id)
		}
	}

	return <>
		<meta name="theme-color" content="#1f0e3c"></meta>
		<Show when={!server.serverOnline()}>
			<div class="offlineMessage">⨳ connecting...</div>
		</Show>
		<Show when={server.serverOnline()}>

			<VideoCall />

			<div class={`middle`}>
				<Planet onDistanceChanged={onDistanceChanged} />
			</div>


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

		<div class={`audio ${videoCall.micEnabled() ? 'active' : 'muted'}`} onclick={() => videoCall.toggleMic()}>
			<Switch>
				<Match when={videoCall.micEnabled()}>
					<SvgIcon icon={'microphone'} />
				</Match>
				<Match when={!videoCall.micEnabled()}>
					<SvgIcon icon={'microphone_muted'} />
				</Match>
			</Switch>
		</div>
		<div class={`video ${videoCall.camEnabled() ? 'active' : 'muted'}`} onclick={() => videoCall.toggleVideo()}>
			<Switch>
				<Match when={videoCall.camEnabled()}>
					<SvgIcon icon={'camera'} />
				</Match>
				<Match when={!videoCall.camEnabled()}>
					<SvgIcon icon={'camera_muted'} />
				</Match>
			</Switch>
		</div>
		<div class={`screen`} onclick={videoCall.toggleScreenShare}>
			<SvgIcon icon={'share_screen'} />
		</div>
	</div>
}

