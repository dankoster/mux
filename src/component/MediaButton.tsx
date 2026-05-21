import { Accessor, Switch, Match, Show } from "solid-js";
import { svgIcon, SvgIcon } from "../SvgIcon";
import { CtrlKeyBind, KeyBind } from "./KeyBind";

import './MediaButton.css'


export function MediaButton(props: {
	className?: string,
	enabled: Accessor<boolean>,
	action: () => void,
	enabledIcon: svgIcon,
	disabledIcon: svgIcon,
	ctrlKeyChar?: string,
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
		<Show when={props.ctrlKeyChar}>
			<CtrlKeyBind char={props.ctrlKeyChar} action={props.action} />
		</Show>
		<Show when={props.keyChar}>
			<KeyBind char={props.keyChar} action={props.action} />
		</Show>
	</div>
}

export function IconButton(props: { action: () => void, keyChar?: string, ctrlKeyChar?: string, icon: svgIcon; }) {
	return <div class={`media-button`} onclick={props.action}>
		<SvgIcon icon={props.icon} />
		<Show when={!!props.ctrlKeyChar}>
			<CtrlKeyBind char={props.ctrlKeyChar} action={props.action} />
		</Show>
		<Show when={!!props.keyChar}>
			<KeyBind char={props.keyChar} action={props.action} />
		</Show>
	</div>
}