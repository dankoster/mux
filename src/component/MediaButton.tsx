import { Accessor, Switch, Match, Show, createSignal } from "solid-js";
import { svgIcon, SvgIcon } from "../SvgIcon";

import './MediaButton.css'


export function MediaButton(props: {
	className?: string,
	enabled: Accessor<boolean>,
	action: () => void,
	enabledIcon: svgIcon,
	disabledIcon: svgIcon,
	keyChar?: string,
}) {
	return <div class={`media-button ${props.className} ${props.enabled() ? 'active' : 'muted'}`} onclick={props.action}>
		<Switch>
			<Match when={props.enabled()}>
				<SvgIcon icon={props.enabledIcon} />
			</Match>
			<Match when={!props.enabled()}>
				<SvgIcon icon={props.disabledIcon} />
			</Match>
		</Switch>
		<Show when={props.keyChar}>
			<KeyBind char={props.keyChar} action={props.action} />
		</Show>
	</div>
}

export function IconButton(props: { action: () => void, keyChar?: string, icon: svgIcon; }) {
	return <div class={`media-button`} onclick={props.action}>
		<SvgIcon icon={props.icon} />
		<Show when={props.keyChar}>
			<KeyBind char={props.keyChar} action={props.action} />
		</Show>
	</div>
}

function KeyBind(props: { char: string, action: () => void }) {

	console.log('INIT KeyBind', `ctrl+${props.char}`)

	const [altDown, setCtrlDown] = createSignal(false)

	document.addEventListener('keyup', (e: KeyboardEvent) => {
		setCtrlDown(e.ctrlKey)
		// console.log('keyup', e)
	})
	document.addEventListener('keydown', (e: KeyboardEvent) => {
		setCtrlDown(e.ctrlKey)
		// console.log('keydown', e)
		if (e.ctrlKey && e.key === props.char) {
			props.action()
		}
	})

	return <Show when={altDown()}>{props.char}</Show>
}
