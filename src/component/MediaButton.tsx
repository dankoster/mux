import { Accessor, Switch, Match, Show, createSignal, onCleanup, onMount } from "solid-js";
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
		<KeyBind char={props.keyChar} action={props.action} />
	</div>
}

function KeyBind(props: { char: string, action: () => void }) {

	if (!props.char) return;

	const [ctrlDown, setCtrlDown] = createSignal(false)

	const onKeyUp = (e: KeyboardEvent) => {
		setCtrlDown(e.ctrlKey)
	}
	const onKeyDown = (e: KeyboardEvent) => {
		setCtrlDown(e.ctrlKey)
		if (e.ctrlKey && e.key === props.char) {
			props.action()
		}
	}

	onMount(() => {
		document.addEventListener('keyup', onKeyUp)
		document.addEventListener('keydown', onKeyDown)
	})
	onCleanup(() => {
		document.removeEventListener('keyup', onKeyUp)
		document.removeEventListener('keydown', onKeyDown)
	})

	return <Show when={ctrlDown()}>
		<span>{props.char}</span>
	</Show>
}
