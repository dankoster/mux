import { createSignal, onMount, Show } from "solid-js"
import { self } from "./data/data"
import { GetSetting, GetSettingValue, SettingCheckBox } from "./Settings"
import * as server from "./data/data";

import { GitHubSvg } from "./GitHubSvg";
import { ServerStats } from "./ServerStats";
import { SvgIcon } from "./SvgIcon";

import "./Welcome.css"

//scrolling words
//https://codepen.io/borntofrappe/pen/Nyzzqq?editors=1100

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

	// const onClick = (e) => {
	// 	//are we clicking on the dialog/backdrop itself? (e.target could be a child element)
	// 	if (e.target === e.currentTarget) {
	// 		dialog.close()
	// 	}
	// }

	const onClickAnonymous = (e) => {
		server.becomeAnonymous()
		dialog.close()
		console.log('welcomeVisible', welcomeVisible())
	}

	return <dialog class="welcome" ref={dialog}>
		<div class="layout">
			<Show when={!server.self()?.identity}>
				<h1>Welcome!</h1>
				<h4>Please enjoy this silly and totally impractical way to ccommunicate!</h4>
				<div class="instruction">
					<SvgIcon icon="hand_pointer" /> <span>Drag to navigate around the world</span>
				</div>
				<div class="instruction">
					<SvgIcon icon="chat" />
					<span>Move near other people to securely
					<div class="slider-container">
						{/* the css animation for slider needs to have one keyframe for each list item */}
						<ul class="slider"> 
							<li>chat</li>
							<li>video call</li>
							<li>screen share</li>
							<li>chat</li>
						</ul>
					</div>
					</span>
				</div>
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
					<li>TODO: avatar preview <SvgIcon icon="person_running" /></li>
					<li>TODO: unread messages <SvgIcon icon="chat" /></li>
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