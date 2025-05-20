import { Accessor, Switch, Match, Show, createSignal, onCleanup, onMount } from "solid-js";
import { svgIcon, SvgIcon } from "../SvgIcon";
import { CtrlKeyBind } from "./KeyBind";

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
			<CtrlKeyBind char={props.keyChar} action={props.action} />
		</Show>
	</div>
}

export function IconButton(props: { action: () => void, keyChar?: string, icon: svgIcon; }) {
	return <div class={`media-button`} onclick={props.action}>
		<SvgIcon icon={props.icon} />
		<CtrlKeyBind char={props.keyChar} action={props.action} />
	</div>
}