import { createSignal, For, Show } from "solid-js";
import { Connection } from "../server/types"
import Chat from "./Chat";

import * as server from "./data/data";
import * as directMessages from "./data/directMessages";

import "./People.css"

export const People = () => {

	const isOnline = (c: Connection) => c.status === 'online'
	const hasIdentity = (c: Connection) => !!c?.identity
	const isFriend = (c: Connection) => server.friends.some(f => f.friendId === c.identity?.id)
	const hasSameIdentity = (c1: Connection, c2: Connection) => c1?.identity && c2?.identity && c1?.identity?.id === c2?.identity?.id

	const hasPendingFriendRequest = (c: Connection) => server.friendRequests.some(fr => fr.toId === c.identity?.id)
	const hasFriendRequest = (c: Connection) => server.friendRequests.some(fr => fr.fromId === c.identity?.id)
	const isUnknown = (c: Connection) => !hasSelfIdentity(c) && !hasSameIdentity(c, server.self()) && !isFriend(c) && (hasIdentity(c) || isOnline(c))
	const hasSelfIdentity = (c: Connection) => c.id === server.self()?.id
	const connectedFriends = () => server.connections.filter(c => !hasSelfIdentity(c) && isFriend(c))
	const hasUnknownConnections = () => server.connections.some(c => isUnknown(c))
	const canFriendRequest = (c: Connection) =>
		hasIdentity(server.self())
		&& hasIdentity(c)
		&& !hasSameIdentity(c, server.self())
		&& !hasSelfIdentity(c)
		&& !isFriend(c)
		&& !hasFriendRequest(c)
		&& !hasPendingFriendRequest(c)

	const unreadLabel = (c: Connection) => {
		const value = directMessages.unreadCountByConId()[c.id]
		return value ? `${value} unread` : ''
	}

	const [selectedConnection, setSelectedConnection] = createSignal<Connection>()

	return <div class="people">
		<div class="connections">
			<Show when={server.connections.some(c => !hasSelfIdentity(c) && hasSameIdentity(c, server.self()))}>
				<div class='connection-list'>
					also me
					<For each={server.connections.filter(c => !hasSelfIdentity(c) && hasSameIdentity(c, server.self()))}>
						{(c) => <div class={`avatar list-item ${c.status}`}>
							<Show when={c.identity}>
								<img alt={c.identity?.name} class="avatar-image" src={c?.identity?.avatar_url} />
							</Show>
							{/* {c.identity?.id ? `[${c.identity.id}] ` : `[${c.id?.substring(c.id.length - 4)}] `} */}
							{c.identity?.name || `guest`} ({c.kind})
						</div>
						}
					</For>
				</div>
			</Show>
			<Show when={connectedFriends().length > 0}>
				<div class='connection-list'>
					friends
					<For each={connectedFriends()}>
						{(c) => <div class={`avatar list-item ${c.status}`}>
							<Show when={c.identity}>
								<img alt={c.identity?.name} class="avatar-image" src={c?.identity?.avatar_url} />
							</Show>
							{/* {c.identity?.id ? `[${c.identity.id}] ` : `[${c.id?.substring(c.id.length - 4)}] `} */}
							{c.identity?.name || `guest`} ({c.kind})

							<button class="dm-button" onclick={() => setSelectedConnection(c)}>💬</button>
							<div>{unreadLabel(c)}</div>
						</div>}
					</For>
				</div>
			</Show>
			<Show when={hasUnknownConnections()}>
				<div class='connection-list'>
					others
					<For each={server.connections.filter(c => isUnknown(c))}>
						{(c) => <div class={`avatar list-item ${c.status}`}>
							<Show when={!c.identity}>
								<div class="avatar-color" style={{ "background-color": c.color }}></div>
							</Show>
							<Show when={c.identity}>
								<img alt={c.identity?.name} class="avatar-image" src={c?.identity?.avatar_url} />
							</Show>
							{/* {c.identity?.id ? `[${c.identity.id}] ` : `[${c.id?.substring(c.id.length - 4)}] `} */}
							{c.identity?.name || `guest`} ({c.kind})
							<Show when={hasPendingFriendRequest(c)}><span>👋</span></Show>
							<Show when={canFriendRequest(c)}>
								<button onClick={() => server.sendFriendRequest(c)}>friend request</button>
							</Show>
							<Show when={hasFriendRequest(c)}>
								<button onClick={() => server.acceptFriendRequest(c)}>accept friend request</button>
							</Show>
						</div>
						}
					</For>
				</div>
			</Show>
		</div>
		<Show when={selectedConnection()}>
			<Chat connection={selectedConnection()} onClose={() => setSelectedConnection(null)} />
		</Show>
	</div>
}