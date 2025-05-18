import { createSignal, onMount, Show } from "solid-js"
import { self } from "./data/data"
import { GetSetting, GetSettingValue, SettingCheckBox } from "./Settings"
import * as server from "./data/data";

import "./Welcome.css"
import { GitHubSvg } from "./GitHubSvg";
import { ServerStats } from "./ServerStats";

export let ShowWelcome: () => void = () => { throw new Error('NOT READY - <Welcome /> element not mounted') }

const [welcomeVisible, setWelcomeVisible] = createSignal(false)

export { welcomeVisible }

export default function Welcome() {
	let dialog: HTMLDialogElement

	onMount(() => {
		dialog.addEventListener('close', () => {
			setWelcomeVisible(false)
		})

		ShowWelcome = () => {
			dialog.showModal()
			setWelcomeVisible(true)
		}

		const shouldShow = GetSettingValue('Show welcome')
		if (shouldShow) {
			dialog.showModal()
			setWelcomeVisible(true)
		}
	})

	const onClick = (e) => {
		//are we clicking on the dialog/backdrop itself? (e.target could be a child element)
		if (e.target === e.currentTarget) {
			dialog.close()
		}
	}

	const onClickAnonymous = (e) => {
		server.becomeAnonymous()
		dialog.close()
		console.log('welcomeVisible', welcomeVisible())
	}

	return <dialog class="welcome" ref={dialog}>
		<div class="layout">
			<Show when={!server.self()?.identity}>
				<h1>Welcome!</h1>
				<div class="welcome-options">
					<button class="room-button" onclick={onClickAnonymous} >
						🥸 be anonymous
					</button>
					<a class="room-button" href={server.githubAuthUrl()?.toString()}>
						<GitHubSvg />be myself
					</a>
				</div>
			</Show>
			<Show when={server.self()?.identity}>
				<h1>Welcome, {self()?.identity?.name}!</h1>
				<ul>
					<li>TODO: avatar preview</li>
					<li>TODO: unread messages</li>
					<li>TODO: server stats since last visit</li>
				</ul>
				<ServerStats />
				<SettingCheckBox setting={GetSetting('Show welcome')} />
				<div class="buttons">
					<button onclick={() => dialog.close()}>Close</button>
					<span class="status"></span>
				</div>
			</Show>
		</div>
	</dialog>
}