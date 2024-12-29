import { For, onMount } from "solid-js"
import "./Settings.css"

export let ShowSettings: () => void = () => { throw new Error('NOT READY - <Settings /> element not mounted') }

type SettingName = 'Start Call Muted (audio)' | 'Start Call Muted (video)'
type Setting = {
	name: SettingName,
	value: boolean
}


const SettingsData: Setting[] = [
	{
		name: 'Start Call Muted (audio)',
		value: true
	},
	{
		name: 'Start Call Muted (video)',
		value: false
	},
]


for (const setting of SettingsData) {
	const value = localStorage.getItem(setting.name)
	if (value !== null) 
		setting.value = JSON.parse(value)
}

export function GetSettingValue(name: SettingName) {
	return SettingsData.find(setting => setting.name === name).value
}

export default function Settings() {
	let popover: HTMLDivElement

	onMount(() => {
		ShowSettings = () => {
			popover.showPopover()
		}
	})

	const close = () => {
		popover.hidePopover()
	}

	const handleChange = (s: Setting, newValue: any) => {
		s.value = newValue
		localStorage.setItem(s.name, JSON.stringify(s.value))
		console.log('changed', s, newValue)
	}

	return <div class="settings" ref={popover} popover>
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
				<button onclick={close}>Done</button>
			</div>
		</div>
	</div>
}