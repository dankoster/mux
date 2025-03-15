import { For, onMount } from "solid-js"
import "./Settings.css"

export let ShowSettings: () => void = () => { throw new Error('NOT READY - <Settings /> element not mounted') }

type SettingName = 'Start video on load'
	| 'Start Call Muted (audio)'
	| 'Start Call Muted (video)'
	| 'Mute when focus is lost'
	| 'Restore mute state when refocused'

type Setting = {
	name: SettingName,
	value: boolean
}


const SettingsData: Setting[] = [
	{
		name: "Start video on load",
		value: false
	},
	{
		name: 'Start Call Muted (audio)',
		value: true
	},
	{
		name: 'Start Call Muted (video)',
		value: false
	},
	{
		name: "Mute when focus is lost",
		value: true
	},
	{
		name: "Restore mute state when refocused",
		value: true
	}
]


for (const setting of SettingsData) {
	const value = localStorage.getItem(setting.name)
	if (value !== null)
		setting.value = JSON.parse(value)
}

export function GetSettingValue(name: SettingName) {
	const setting = SettingsData.find(setting => setting.name === name)
	if (!setting) throw new Error(`setting "${name}" not found`)

	return setting.value
}

export default function Settings() {
	let dialog: HTMLDialogElement

	onMount(() => {
		ShowSettings = () => {
			dialog.showModal()
		}
	})

	const closeSettings = () => {
		dialog.close()
	}

	const handleChange = (s: Setting, newValue: any) => {
		s.value = newValue
		localStorage.setItem(s.name, JSON.stringify(s.value))
		console.log('changed', s, newValue)
	}

	const onClick = (e) => {
		//are we clicking on the dialog/backdrop itself? (e.target could be a child element)
		if (e.target === e.currentTarget) {
			//e.stopPropagation(); //don't click things under the backdrop
			closeSettings();
		}
	}

	return <dialog class="settings" onclick={onClick} ref={dialog}>
		<div class="layout">
			<h2>Settings</h2>
			<div>
				<For each={SettingsData}>
					{setting => <div>
						<input type="checkbox"
							id={setting.name}
							name={setting.name}
							checked={setting.value}
							onChange={(e) => handleChange(setting, e.currentTarget.checked)} />
						<label for={setting.name}>{setting.name}</label>
					</div>}
				</For>
			</div>
			<div class="buttons">
				<span class="status"></span>
				<button onclick={closeSettings}>Close</button>
			</div>
		</div>
	</dialog>
}