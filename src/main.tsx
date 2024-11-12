import "./main.css"

import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { render } from "solid-js/web";
import * as server from "./data";
import VideoCall from "./VideoCall";
import ConnectionsGraph from "./Connections";
import { trackStore } from "@solid-primitives/deep";

import type { Connection, DM, DMRequest } from "../server/types"
import { GitHubSvg } from "./GitHubSvg";

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

	const connectedFriends = () => server.connections.filter(c => !isSelf(c) && isFriend(c))

	const isRoomOwner = (c: Connection) => server.rooms.find(room => room.id === c.roomId)?.ownerId === c.id;
	const isOnline = (c: Connection) => c.status === 'online'
	const hasIdentity = (c: Connection) => !!c?.identity
	const hasPendingFriendRequest = (c: Connection) => server.friendRequests.some(fr => fr.toId === c.identity?.id)
	const hasFriendRequest = (c: Connection) => server.friendRequests.some(fr => fr.fromId === c.identity?.id)
	const isFriend = (c: Connection) => server.friends.some(f => f.friendId === c.identity?.id)
	const isUnknown = (c: Connection) => !isSelf(c) && !hasSameIdentity(c, server.self()) && !isFriend(c) && (hasIdentity(c) || isOnline(c))
	const isSelf = (c: Connection) => c.id === server.self()?.id
	const hasSameIdentity = (c1: Connection, c2: Connection) => c1?.identity && c2?.identity && c1?.identity?.id === c2?.identity?.id
	const hasUnknownConnections = () => server.connections.some(c => isUnknown(c))
	const canFriendRequest = (c: Connection) =>
		hasIdentity(server.self())
		&& hasIdentity(c)
		&& !hasSameIdentity(c, server.self())
		&& !isSelf(c)
		&& !isFriend(c)
		&& !hasFriendRequest(c)
		&& !hasPendingFriendRequest(c)

	const onMessageKeyDown = async (e: KeyboardEvent, con: Connection) => {
		const input = e.target as HTMLTextAreaElement
		if (e.key === 'Enter') {
			const value = input.value
			input.value = ''

			try {
				const dm = await server.sendDm(con, value)
				saveLocalDm(dm, dm.toId)
			} catch (err) {
				setDmError(err.message)
			}
		}
	}

	const dmByConId: { [key: string]: DM[] } = {}
	function saveLocalDm(dm: DM, conId: string) {
		if (!dmByConId[conId])
			dmByConId[conId] = [dm];
		else
			dmByConId[conId].push(dm);

		if (conId === selectedDmTarget()?.id)
			setDmList([...dmByConId[conId]])
	}

	server.onDM((dm: DM) => {
		if (!selectedDmTarget())
			setSelectedDmTarget(server.connections.find(c => c.id === dm.fromId))

		saveLocalDm(dm, dm.fromId)
	})

	const [selectedDmTarget, setSelectedDmTarget] = createSignal<Connection>()
	const [dmList, setDmList] = createSignal<DM[]>()
	const [dmError, setDmError] = createSignal("")

	const showDmConversation = async (con: Connection) => {
		setDmError(null)
		setSelectedDmTarget(con)
		
		if (!con.publicKey) {
			setDmError(`Cannot enctypt messages to ${con.identity?.name}! They need to sign in to generate a public key.`)
			return
		}

		let history = dmByConId[con?.id]

		try {
			const req: DMRequest = { qty: 20, timestamp: Date.now(), conId: con.id }
			if (!history || history.length === 0) {
				history = await server.getDmHistory(con, req)
				dmByConId[con?.id] = history
				setDmList(con && history)
			}
		} catch (err) {
			setDmError(err.message)
		}
	}

	return <>
		<meta name="theme-color" content="#1f0e3c"></meta>
		<Show when={!server.serverOnline()}>
			<div class="offlineMessage">connecting...</div>
		</Show>
		<Show when={server.serverOnline()}>
			<div class="header">
				<div class="header-left">
					<h3 class="logo">⨳ chatMUX</h3>
					<div class="stats">
						<div class="userCount"><b>{server.stats()?.online ?? "?"}</b> online 👀</div>
						<div class="userCount"><b>{server.stats()?.offline ?? "?"}</b> offline 😴</div>
					</div>
				</div>
				<div class="user">
					<Show when={!server.self()?.identity}>
						<div class="color-picker">
							<input
								class="color-input"
								type="color"
								oninput={(e) => e.target.parentElement.style.backgroundColor = e.target.value}
								onchange={(e) => server.setColor(e.target.value)}
								value={server.self()?.color ?? 'transparent'} />
						</div>
					</Show>
					<Show when={!server.self()?.identity}>
						<a class="room-button" href={server.githubAuthUrl()?.toString()}>
							<GitHubSvg />login
						</a>
					</Show>
					<Show when={server.self()?.identity}>
						<div class="avatar button" onclick={() => server.becomeAnonymous()}>
							<div class="name">{server.self()?.identity.name}</div>
							<img alt={server.self()?.identity?.name} src={server.self()?.identity.avatar_url} />
						</div>
					</Show>

				</div>
			</div>

			<div class={`middle ${callState()}`}>
				<ConnectionsGraph self={server.self()} connections={server.connections} />
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
					user={server.self()}
					room={room()}
					connections={server.connections.filter(sc => server.self()?.roomId && sc.id != server.self()?.id && sc.roomId === server.self()?.roomId)} />
			</div>
			<Show when={selectedDmTarget()}>
				<div class="dm-chat">
					<h2>dm with {selectedDmTarget().identity?.name}</h2>
					<Show when={dmError()}>ERROR: {dmError()}</Show>
					<Show when={!dmError()}>
						<span onclick={() => showDmConversation(null)}>close</span>
						<div class="dm-messages">
							<For each={dmList()}>
								{dm => <div>[{new Date(dm.timestamp).toLocaleTimeString()}] {dm.fromName || dm.fromId}: {dm.message as string}</div>}
							</For>
						</div>
						<input type="text" onKeyDown={(e) => onMessageKeyDown(e, selectedDmTarget())} />
						<span class='latest-dm' id={`con${selectedDmTarget().id}`}></span>
					</Show>
				</div>
			</Show>
			<div class="connections">
				<Show when={server.connections.some(c => !isSelf(c) && hasSameIdentity(c, server.self()))}>
					<div class='connection-list'>
						also me
						<For each={server.connections.filter(c => !isSelf(c) && hasSameIdentity(c, server.self()))}>
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

								<button class="dm-button" onclick={() => showDmConversation(c)}>💬</button>
								<Show when={isOnline(c)}>
									online!
								</Show>
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
			<div class="toolbar">
				<div class="buttons">
					{server.self()?.roomId &&
						<button class="room-button" onclick={() => exitRoom(server.self()?.roomId)}>
							{isRoomOwner(server.self()) ? "End" : "Leave"} call
						</button>
					}
					{!server.self()?.roomId &&
						<button class="room-button" onclick={startCall}>🤙 call</button>
					}
					{/* <button class="room-button" onclick={startCall}>💬 chat</button> */}
				</div>
			</div>

		</Show>
	</>
};


render(() => <App />, document.body)

