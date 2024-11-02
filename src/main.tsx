import "./index.css"
import "./main.css"

import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { render } from "solid-js/web";
import * as server from "./data";
import VideoCall from "./VideoCall";
import ConnectionsGraph from "./Connections";
import { trackStore } from "@solid-primitives/deep";

import type { Connection } from "../server/types"

type CallState = "no_call" | "server_wait" | "server_error" | "call_ready" | "call_connected"

const App = () => {

	const exitRoom = async (roomId: string) => {
		console.log('exit room...')
		const response = await server.exitRoom(roomId)
		console.log('...exit room', response.ok)

		setCallState("no_call")
	}

	const room = createMemo(() => server.rooms.find(r => r.id === server.self()?.roomId))

	const [callState, setCallState] = createSignal<CallState>("no_call")
	const startCall = async () => {
		setCallState("server_wait")
		const room = await server.createRoom()

		if (!room.id) {
			console.error("error creating room!", room)
			setCallState("server_error")
			return
		}

		console.log('Call started!')
		setCallState("call_ready")
	}

	const friendRequest = async (con: Connection) => {
		const result = await server.sendFriendRequest(con)
	}

	const becomeAnonymous = () => {
		server.becomeAnonymous()
	}


	createEffect(() => {
		trackStore(server.connections)

		// get raw connection objects out of the SolidJS Signal where they are proxies
		const connections = server.self()?.roomId && server.connections
			.map(node => Object.assign({}, node))
			.filter(node => node.roomId === server.self()?.roomId)

		//figure out how many connections are in the user's room
		if (!connections) {
			setCallState("no_call")
		} else if (connections?.length === 1) {
			setCallState("call_ready")
		} else if (connections?.length > 1) {
			setCallState("call_connected")
		}
	},)

	const shortUserId = () => {
		const c = server.self()
		return c?.identity?.id ? `[${c?.identity.id}]` : `[${c?.id?.substring(c?.id.length - 4)}]`
	}


	const isOnline = (c: Connection) => c.status === 'online'
	const hasIdentity = (c: Connection) => !!c?.identity
	const hasPendingFriendRequest = (c: Connection) => server.friendRequests.some(fr => fr.toId === c.identity?.id)
	const hasFriendRequest = (c: Connection) => server.friendRequests.some(fr => fr.fromId === c.identity?.id)
	const isFriend = (c: Connection) => server.friends.some(f => f.friendId === c.identity?.id)
	const isUnknown = (c: Connection) => !isSelf(c) && !hasSameIdentity(c, server.self()) && !isFriend(c) && (hasIdentity(c) || isOnline(c))
	const isSelf = (c: Connection) => c.id === server.self()?.id
	const hasSameIdentity = (c1: Connection, c2: Connection) => c1?.identity?.id === c2?.identity?.id
	const hasFriends = (c: Connection) => server.friends.length > 0
	const canFriendRequest = (c: Connection) =>
		hasIdentity(server.self())
		&& hasIdentity(c)
		&& !hasSameIdentity(c, server.self())
		&& !isSelf(c)
		&& !isFriend(c)
		&& !hasFriendRequest(c)
		&& !hasPendingFriendRequest(c)

	return <>
		<Show when={!server.serverOnline()}>
			<div class="offlineMessage">connecting...</div>
		</Show>
		<Show when={server.serverOnline()}>
			<div class="header">
				<h1 class="logo">⨳ chatMUX</h1>
				<div class="stats">
					<div class="userCount"><b>{server.stats()?.online ?? "?"}</b> online 👀</div>
					<div class="userCount"><b>{server.stats()?.offline ?? "?"}</b> offline 😴</div>
				</div>
			</div>

			<Show when={server.connections.find(con => con.id === server.id())}>
				{(con) => <>
					<div class={`middle ${callState()}`}>
						<ConnectionsGraph self={con()} connections={server.connections} />
						<Show when={callState() === "server_wait"}>
							<div class="call_state_message">waiting for server... hit [start call] to retry.</div>
						</Show>
						<Show when={callState() === "server_error"}>
							<div class="call_state_message">the server is unhappy... please refresh!</div>
						</Show>
						<Show when={callState() === "call_ready"}>
							<div class="call_state_message">waiting for someone else to join...</div>
						</Show>
						<VideoCall
							user={con()}
							room={room()}
							connections={server.connections.filter(sc => con()?.roomId && sc.id != con()?.id && sc.roomId === con()?.roomId)} />
					</div>
					<Show when={server.connections.some(c => !isSelf(c) && hasSameIdentity(c, server.self()))}>
						<div class='connection-list'>
							also me
							<For each={server.connections.filter(c => !isSelf(c) && hasSameIdentity(c, server.self()))}>
								{(c) => <div class={`avatar list-item ${c.status}`}>
									<Show when={c.identity}>
										<img src={c?.identity?.avatar_url} />
									</Show>
									{/* {c.identity?.id ? `[${c.identity.id}] ` : `[${c.id?.substring(c.id.length - 4)}] `} */}
									{c.identity?.name || `guest`} ({c.kind})
								</div>
								}
							</For>
						</div>
					</Show>
					<Show when={hasFriends(server.self())}>
						<div class='connection-list'>
							friends
							<For each={server.connections.filter(c => !isSelf(c) && isFriend(c))}>
								{(c) => <div class={`avatar list-item ${c.status}`}>
									<Show when={c.identity}>
										<img src={c?.identity?.avatar_url} />
									</Show>
									{/* {c.identity?.id ? `[${c.identity.id}] ` : `[${c.id?.substring(c.id.length - 4)}] `} */}
									{c.identity?.name || `guest`} ({c.kind})
								</div>
								}
							</For>
						</div>
					</Show>

					<div class='connection-list'>
						<For each={server.connections.filter(c => isUnknown(c))}>
							{(c) => <div class={`avatar list-item ${c.status}`}>
								<Show when={!c.identity}>
									<div style={{ "background-color": c.color }}></div>
								</Show>
								<Show when={c.identity}>
									<img src={c?.identity?.avatar_url} />
								</Show>
								{/* {c.identity?.id ? `[${c.identity.id}] ` : `[${c.id?.substring(c.id.length - 4)}] `} */}
								{c.identity?.name || `guest`} ({c.kind})
								<Show when={hasPendingFriendRequest(c)}>pending friend request...</Show>
								<Show when={canFriendRequest(c)}>
									<button onClick={() => friendRequest(c)}>friend request</button>
								</Show>
								<Show when={hasFriendRequest(c)}>
									<button onClick={() => server.acceptFriendRequest(c)}>accept friend request</button>
								</Show>
							</div>
							}
						</For>
					</div>
					<div class="toolbar">
						<div class="buttons">
							<Show when={!con()?.identity}>
								<div class="color-button">
									<input
										type="color"
										oninput={(e) => e.target.parentElement.style.backgroundColor = e.target.value}
										onchange={(e) => server.setColor(e.target.value)}
										value={con()?.color ?? 'transparent'} />

								</div>
							</Show>
							<Show when={!con()?.identity}>
								<a class="room-button" href={server.githubAuthUrl()?.toString()}>
									<svg height="16" width="16" viewBox="0 0 16 16" version="1.1" aria-hidden="true">
										<path
											d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
											fill-rule="evenodd"
											fill="currentColor"></path>
									</svg>
									login</a>
							</Show>
							<Show when={con()?.identity}>
								<div class="avatar button" onclick={becomeAnonymous}>
									<img src={con()?.identity.avatar_url} />
									<div class="name">{con()?.identity.name}</div>
								</div>
							</Show>

							{con()?.roomId &&
								<button class="room-button" onclick={() => exitRoom(con()?.roomId)}>
									{isRoomOwner(con()) ? "End" : "Leave"} call
								</button>
							}
							{!con()?.roomId &&
								<button class="room-button" onclick={startCall}>start call</button>
							}
						</div>
						<div class="server">{shortUserId()}</div>
					</div>
				</>}
			</Show>
		</Show>
	</>
};


function isRoomOwner(con: Connection) {
	return server.rooms.find(room => room.id === con.roomId)?.ownerId === con.id;
}

render(() => <App />, document.body);
