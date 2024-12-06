
import { createEffect, createSignal, onMount, Show } from "solid-js";
import { render } from "solid-js/web";
import { GitHubSvg } from "./GitHubSvg";
import { Planet } from "./planet";
import { JSX } from "solid-js/jsx-runtime";
import { Call } from "./Call";
import { People } from "./People";
import { scrollLatestMessageIntoView } from "./Chat";

import ConnectionsGraph from "./Connections";

import * as server from "./data/data";

import "./main.css"
import { FigmentMenu, MenuItem } from "./Menu";

type SelectedView = 'people' | 'call' | 'planet' | 'graph'

render(() => <App />, document.body)

function App() {

	const [selectedView, setSelectedView] = createSignal<SelectedView>("planet")
	const [selectedSecondaryView, setSelectedSecondaryView] = createSignal<JSX.Element>()

	const primaryView: Record<SelectedView, () => JSX.Element> = {
		people: () => <People />,
		call: () => <Call />,
		planet: () => <Planet />,
		graph: () => <ConnectionsGraph self={server.self()} connections={server.connections} />
	}

	createEffect(() => {
		if (selectedView() === 'people') {
			scrollLatestMessageIntoView()
		}
	})

	createEffect(() => {
		if (server.self()?.roomId) {
			setSelectedView('call')
		}
	})

	const userClicked = (e: MouseEvent) => {
		//TODO: showDmConversation(null)

		menu.Clear()
		menu.AddItem(new MenuItem({
			text: `call`,
			onTextClick: () => setSelectedView('call'),
		}))
		menu.AddItem(new MenuItem({
			text: `3d`,
			onTextClick: () => setSelectedView('planet'),
		}))
		menu.AddItem(new MenuItem({
			text: `people`,
			onTextClick: () => setSelectedView('people'),
		}))
		menu.AddItem(new MenuItem({
			text: `graph`,
			onTextClick: () => setSelectedView('graph'),
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

	return <>
		<meta name="theme-color" content="#1f0e3c"></meta>
		<Show when={!server.serverOnline()}>
			<div class="offlineMessage">⨳ connecting...</div>
		</Show>
		<Show when={server.serverOnline()}>
			<div class="header">
				<div class="header-left">
					<h2 class="logo">⨳</h2>
					<div class="stats">
						<div class="userCount"><b>{server.stats()?.online ?? "?"}</b> online 👀</div>
						<div class="userCount"><b>{server.stats()?.offline ?? "?"}</b> offline 😴</div>
					</div>
				</div>
			</div>


			<div class={`middle`}>
				{primaryView[selectedView()]()}
				<Show when={selectedSecondaryView()}>
					{selectedSecondaryView()}
				</Show>
			</div>


			<div class="toolbar">
				<div class="user">

					<div class="color-picker">
						<input
							class="color-input"
							type="color"
							oninput={(e) => e.target.parentElement.style.backgroundColor = e.target.value}
							onchange={(e) => server.setColor(e.target.value)}
							value={server.self()?.color ?? 'transparent'} />
					</div>
					<Show when={!server.self()?.identity}>
						<a class="room-button" href={server.githubAuthUrl()?.toString()}>
							<GitHubSvg />login
						</a>
					</Show>
					<Show when={server.self()?.identity}>
						<div class="avatar button" onclick={userClicked}>
							<div class="name">{server.self()?.identity.name}</div>
							<img alt={server.self()?.identity?.name} src={server.self()?.identity.avatar_url} />
						</div>
					</Show>

				</div>
				{/* <div class="buttons">
					<button class="room-button" onclick={() => setSelectedView('call')}>call</button>
					<button class="room-button" onclick={() => setSelectedView('people')}>people</button>
					<button class="room-button" onclick={() => setSelectedView('planet')}>3D</button>
					<button class="room-button" onclick={() => setSelectedView('graph')}>graph</button>
				</div> */}
			</div>

		</Show>
	</>
};
