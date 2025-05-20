import { createMemo, onMount, Show } from "solid-js";
import { IconButton, MediaButton } from "./component/MediaButton";
import { MenuItem, FigmentMenu } from "./Menu";
import { ShowSettings } from "./Settings";

import * as server from "./data/data";
import * as VideoCall from "./VideoCall";
import { ServerStats } from "./ServerStats";
import { GitHubSvg } from "./GitHubSvg";
import { addArea } from "./planet/planet";


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
			onTextClick: () => server.becomeAnonymous(),
		}));
		menu.ShowFor((e.target as HTMLElement).parentElement);
	};

	let menu: FigmentMenu;
	onMount(() => {
		menu = new FigmentMenu();
	});

	const userHasIdentity = createMemo(() => !!server.self()?.identity)

	return <div class="toolbar">
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
				<IconButton icon="hammer" action={() => addArea()} keyChar="b" />
				<MediaButton
					keyChar="m"
					className="audio"
					enabled={VideoCall.micEnabled}
					action={() => VideoCall.toggleMic()}
					enabledIcon="microphone"
					disabledIcon="microphone_muted" />
				<MediaButton
					className="video"
					enabled={VideoCall.camEnabled}
					action={() => VideoCall.toggleVideo()}
					enabledIcon="camera"
					disabledIcon="camera_muted" />
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
			</div>
		</div>
	</div>
}
