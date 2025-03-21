import { onMount } from "solid-js"
import "./Welcome.css"
import { self } from "./data/data"
import { GetSetting, GetSettingValue, SettingCheckBox } from "./Settings"

export let ShowWelcome: () => void = () => { throw new Error('NOT READY - <Welcome /> element not mounted') }


export default function Welcome() {
	let dialog: HTMLDialogElement
	const shouldShow = GetSettingValue('Show welcome')

	onMount(() => {
		ShowWelcome = () => {
			dialog.showModal()
		}

		if(shouldShow) dialog.showModal()
	})

	const onClick = (e) => {
		//are we clicking on the dialog/backdrop itself? (e.target could be a child element)
		if (e.target === e.currentTarget)
			dialog.close()
	}

	return <dialog class="welcome" onclick={onClick} ref={dialog}>
		<div class="layout">
			<h1>Welcome, {self()?.identity?.name ?? 'traveler'}!</h1>
			<ul>
				<li>TODO: ask the user to login or chose a generated transient identity (include browser agent id)</li>
				<li>TODO: avatar preview</li>
				<li>TODO: unread messages</li>
				<li>TODO: server stats since last visit</li>
			</ul>
			<SettingCheckBox setting={GetSetting('Show welcome')} />
			<div class="buttons">
				<span class="status"></span>
				<button onclick={() => dialog.close()}>Close</button>
			</div>
		</div>
	</dialog>
}