import { Accessor, Switch, Match } from "solid-js";
import { svgIcon, SvgIcon } from "./SvgIcon";

export function MediaButton(props: { className: string; enabled: Accessor<boolean>; onClick: () => void; enabledIcon: svgIcon; disabledIcon: svgIcon; }) {
	return <div class={`${props.className} ${props.enabled() ? 'active' : 'muted'}`} onclick={props.onClick}>
		<Switch>
			<Match when={props.enabled()}>
				<SvgIcon icon={props.enabledIcon} />
			</Match>
			<Match when={!props.enabled()}>
				<SvgIcon icon={props.disabledIcon} />
			</Match>
		</Switch>
	</div>
}
