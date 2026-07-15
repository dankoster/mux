import { createMemo, onMount, Show } from "solid-js";
import { IconButton, MediaButton } from "./component/MediaButton";
import { MenuItem, FigmentMenu } from "./Menu";
import { ShowSettings } from "./Settings";

import * as server from "./data/data";
import * as planet from "./planet/planet";
import * as VideoCall from "./VideoCall";
import { ServerStats } from "./ServerStats";
import { GitHubSvg } from "./GitHubSvg";
import { AddPalm } from "./planet/entity/palm";
import { AreaProximityCards } from "./AreaProximityCards";
import AvatarProximityCall from "./AvatarProximityCall";


export function UserToolbar() {
	const showMenu = (e: MouseEvent) => {
		menu.Clear();
		menu.AddItem(new MenuItem({
			text: `Settings`,
			onTextClick: () => {
				ShowSettings();
				menu.Clear();
			}
		}));
		menu.AddSeparator();
		menu.AddItem(new MenuItem({
			text: `Logout ${server.self().identity.name}`,
			onTextClick: () => {
				server.becomeAnonymous()
				planet.becomeAnynomous()
				menu.Clear()
			},
		}));
		menu.ShowFor((e.target as HTMLElement).parentElement);
	};

	let menu: FigmentMenu;
	onMount(() => {
		menu = new FigmentMenu();
	});

	const userHasIdentity = createMemo(() => !!server.self()?.identity)

	return <div class="footer">
		<AreaProximityCards />
		<AvatarProximityCall />

		<div class="toolbar">
			<ServerStats />

			<div class="user">
				<Show when={!userHasIdentity()}>
					<a class="room-button" href={server.githubAuthUrl()?.toString()}>
						<GitHubSvg />login
					</a>
				</Show>
				<div class="avatar button">
					<Show when={userHasIdentity()}>
						<img alt={server.self()?.identity?.name} src={server.self()?.identity.avatar_url} onclick={showMenu} />
						<div class="name" onclick={showMenu}>{server.self()?.identity.name}</div>
					</Show>
					<IconButton icon="gear" action={() => ShowSettings()} keyChar="s" />

					<MediaButton
						keyChar="v"
						className="video"
						enabled={VideoCall.camEnabled}
						action={() => VideoCall.toggleVideo()}
						enabledIcon="camera"
						disabledIcon="camera_muted" />
					<Show when={VideoCall.camEnabled()}>
						<MediaButton
							keyChar="m"
							className="audio"
							enabled={VideoCall.micEnabled}
							action={() => VideoCall.toggleMic()}
							enabledIcon="microphone"
							disabledIcon="microphone_muted" />
					</Show>

					<IconButton icon="hammer" action={() => AddPalm()} keyChar="b" />
					<Show when={VideoCall.isConnected()}>
						<MediaButton
							className="screen"
							enabled={VideoCall.screenEnabled}
							action={() => VideoCall.toggleScreenShare()}
							enabledIcon="share_screen"
							disabledIcon="share_screen" />
						<MediaButton
							className="max-video"
							enabled={VideoCall.maxVideoEnabled}
							action={() => VideoCall.toggleMaxVideo()}
							enabledIcon="compress"
							disabledIcon="expand" />
					</Show>
				</div>
			</div>
		</div>
	</div>
}
