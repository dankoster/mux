
import { createEffect, createSignal, Match, onMount, Show, Switch } from "solid-js";
import { render } from "solid-js/web";
import { GitHubSvg } from "./GitHubSvg";
import { Planet } from "./planet";
import { JSX } from "solid-js/jsx-runtime";
import { People } from "./People";
import { scrollLatestMessageIntoView } from "./Chat";

import * as server from "./data/data";

import "./main.css"
import { FigmentMenu, MenuItem } from "./Menu";
import VideoCall, { enableLocal } from "./VideoCall";

type SelectedView = 'people' | 'planet'

render(() => <App />, document.body)

function App() {

	const [selectedView, setSelectedView] = createSignal<SelectedView>("planet")
	const [micEnabled, setMicEnabled] = createSignal(true)
	const [camEnabled, setCamEnabled] = createSignal(true)

	const primaryView: Record<SelectedView, () => JSX.Element> = {
		people: () => <People />,
		planet: () => <Planet />,
	}

	createEffect(() => {
		if (selectedView() === 'people') {
			scrollLatestMessageIntoView()
		}
	})

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
			text: `Logout ${server.self().identity.name}`,
			onTextClick: () => server.becomeAnonymous(),
		}))
		menu.ShowFor((e.target as HTMLElement).parentElement)
	}

	const toggleMic = () => {
		const enabled = !micEnabled()
		setMicEnabled(enabled)
		enableLocal('audio', enabled)
	}
	const toggleVideo = () => {
		const enabled = !camEnabled()
		setCamEnabled(enabled)
		enableLocal('video', enabled)
	}

	let menu: FigmentMenu
	onMount(() => {
		menu = FigmentMenu.Create({ extraClasses: 'menu-keep-open' }) as FigmentMenu
	})

	return <>
		<meta name="theme-color" content="#1f0e3c"></meta>
		<Show when={!server.serverOnline()}>
			<div class="offlineMessage">⨳ connecting...</div>
		</Show>
		<Show when={server.serverOnline()}>
			{/* <div class="header">
				<div class="header-left">
					<h2 class="logo">⨳</h2>
					<div class="stats">
						<div class="userCount"><b>{server.stats()?.online ?? "?"}</b> online 👀</div>
						<div class="userCount"><b>{server.stats()?.offline ?? "?"}</b> offline 😴</div>
					</div>
				</div>
			</div> */}

			<VideoCall />

			<div class={`middle`}>
				{primaryView[selectedView()]()}
			</div>


			<div class="toolbar">
				<div class="stats">
					<h2 class="logo">⨳</h2>
					<div class="userCount"><b>{server.stats()?.online ?? "?"}</b> online 👀</div>
					<div class="userCount"><b>{server.stats()?.offline ?? "?"}</b> offline 😴</div>
				</div>

				<div class="user">

					{/* <div class="color-picker">
						<input
							class="color-input"
							type="color"
							oninput={(e) => e.target.parentElement.style.backgroundColor = e.target.value}
							onchange={(e) => server.setColor(e.target.value)}
							value={server.self()?.color ?? 'transparent'} />
					</div> */}
					<Show when={!server.self()?.identity}>
						<a class="room-button" href={server.githubAuthUrl()?.toString()}>
							<GitHubSvg />login
						</a>
					</Show>
					<Show when={server.self()?.identity}>
						<div class="avatar button">
							<img alt={server.self()?.identity?.name} src={server.self()?.identity.avatar_url} onclick={userClicked} />
							<div class="name" onclick={userClicked}>{server.self()?.identity.name}</div>
							<div class={`audio ${!micEnabled() && 'muted'}`} onclick={toggleMic}>
								<Switch>
									<Match when={micEnabled()}>
										<SvgIcon icon={'microphone'} />
									</Match>
									<Match when={!micEnabled()}>
										<SvgIcon icon={'microphone_disabled'} />
									</Match>
								</Switch>
							</div>
							<div class={`video ${!camEnabled() && 'muted'}`} onclick={toggleVideo}>
								<Switch>
									<Match when={camEnabled()}>
										<SvgIcon icon={'camera'} />
									</Match>
									<Match when={!camEnabled()}>
										<SvgIcon icon={'camera_disabled'} />
									</Match>
								</Switch>
							</div>
						</div>
					</Show>

				</div>
			</div>
		</Show>
	</>
};

type svgIcon = 'camera' | 'camera_disabled' | 'microphone' | 'microphone_disabled'
function SvgIcon(props: { icon: svgIcon }) {
	// Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.
	switch (props.icon) {
		case 'camera':
			return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M0 128C0 92.7 28.7 64 64 64l256 0c35.3 0 64 28.7 64 64l0 256c0 35.3-28.7 64-64 64L64 448c-35.3 0-64-28.7-64-64L0 128zM559.1 99.8c10.4 5.6 16.9 16.4 16.9 28.2l0 256c0 11.8-6.5 22.6-16.9 28.2s-23 5-32.9-1.6l-96-64L416 337.1l0-17.1 0-128 0-17.1 14.2-9.5 96-64c9.8-6.5 22.4-7.2 32.9-1.6z" /></svg>
		case 'camera_disabled':
			return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M38.8 5.1C28.4-3.1 13.3-1.2 5.1 9.2S-1.2 34.7 9.2 42.9l592 464c10.4 8.2 25.5 6.3 33.7-4.1s6.3-25.5-4.1-33.7l-86.4-67.7 13.8 9.2c9.8 6.5 22.4 7.2 32.9 1.6s16.9-16.4 16.9-28.2l0-256c0-11.8-6.5-22.6-16.9-28.2s-23-5-32.9 1.6l-96 64L448 174.9l0 17.1 0 128 0 5.8-32-25.1L416 128c0-35.3-28.7-64-64-64L113.9 64 38.8 5.1zM407 416.7L32.3 121.5c-.2 2.1-.3 4.3-.3 6.5l0 256c0 35.3 28.7 64 64 64l256 0c23.4 0 43.9-12.6 55-31.3z" /></svg>
		case 'microphone':
			return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M192 0C139 0 96 43 96 96l0 160c0 53 43 96 96 96s96-43 96-96l0-160c0-53-43-96-96-96zM64 216c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 40c0 89.1 66.2 162.7 152 174.4l0 33.6-48 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l72 0 72 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-48 0 0-33.6c85.8-11.7 152-85.3 152-174.4l0-40c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 40c0 70.7-57.3 128-128 128s-128-57.3-128-128l0-40z" /></svg>
		case 'microphone_disabled':
			return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path d="M38.8 5.1C28.4-3.1 13.3-1.2 5.1 9.2S-1.2 34.7 9.2 42.9l592 464c10.4 8.2 25.5 6.3 33.7-4.1s6.3-25.5-4.1-33.7L472.1 344.7c15.2-26 23.9-56.3 23.9-88.7l0-40c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 40c0 21.2-5.1 41.1-14.2 58.7L416 300.8 416 96c0-53-43-96-96-96s-96 43-96 96l0 54.3L38.8 5.1zM344 430.4c20.4-2.8 39.7-9.1 57.3-18.2l-43.1-33.9C346.1 382 333.3 384 320 384c-70.7 0-128-57.3-128-128l0-8.7L144.7 210c-.5 1.9-.7 3.9-.7 6l0 40c0 89.1 66.2 162.7 152 174.4l0 33.6-48 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l72 0 72 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-48 0 0-33.6z" /></svg>

		default: throw new Error('must specify an icon')
	}
}