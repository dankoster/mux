import { createSignal, For, onMount } from "solid-js"
import "./Settings.css"

export let ShowSettings: () => void = () => { throw new Error('NOT READY - <Settings /> element not mounted') }

type SettingName = "Show welcome"
	| 'Start video on load'
	| 'Start Call Muted (audio)'
	| 'Start Call Muted (video)'
	| 'Mute when focus is lost'
	| 'Restore mute state when refocused'

type Setting = {
	name: SettingName,
	value: boolean
}

//set up defaults
const SettingsData: Setting[] = [
	{
		name: "Show welcome",
		value: true
	},
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

//override any defaults that are already in local storage
for (const setting of SettingsData) {
	const value = localStorage.getItem(setting.name)
	if (value !== null)
		setting.value = JSON.parse(value)
}

export function GetSettingValue(name: SettingName) {
	return !!JSON.parse(localStorage.getItem(name))
}

export function GetSetting(name: SettingName): Setting {
	return { name, value: GetSettingValue(name) }
}

export default function Settings() {
	let dialog: HTMLDialogElement

	onMount(() => {
		//override the exported show functino! 
		ShowSettings = () => {
			dialog.showModal()
		}
	})

	const closeSettings = () => {
		dialog.close()
	}

	const onClick = (e) => {
		//are we clicking on the dialog/backdrop itself? (e.target could be a child element)
		if (e.target === e.currentTarget) {
			closeSettings();
		}
	}

	const [settings] = createSignal(SettingsData)

	return <dialog class="settings" onclick={onClick} ref={dialog}>
		<div class="layout">
			<h2>Settings</h2>
			<div class="settingsList">
				<For each={settings()}>
					{setting => <SettingCheckBox setting={setting} />}
				</For>
			</div>
			<div class="buttons">
				<span class="status"></span>
				<button onclick={closeSettings}>Close</button>
			</div>
		</div>
	</dialog>
}

export function SettingCheckBox(props: { setting: Setting }) {

	//SolidJS why are you so jank?!?!
	const [setting, setSetting] = createSignal(props.setting)

	const handleChange = (e) => {
		setting().value = e.currentTarget.checked
		localStorage.setItem(setting().name, JSON.stringify(setting().value))
		console.log(setting())
	}

	return <label class="settingCheckBox" >
		<input type="checkbox"
			checked={setting().value}
			onChange={handleChange} />
		{setting().name}
	</label>
}