import "./main.css"

import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { trackStore } from "@solid-primitives/deep";
import { render } from "solid-js/web";

import * as server from "./data/data";
import * as directMessages from "./data/directMessages";

import VideoCall from "./VideoCall";
import ConnectionsGraph from "./Connections";

import type { Connection, DM } from "../server/types"
import { GitHubSvg } from "./GitHubSvg";
import { ageTimestamp, diffTime, shortTime } from "./time";
import { isSelf } from "./data/data";
import { Planet } from "./planet";

type CallState = "no_call" | "server_wait" | "server_error" | "call_ready" | "call_connected"
type SelectedView = 'chat' | 'call' | '3d' | 'graph'

const App = () => {

	const [callState, setCallState] = createSignal<CallState>("no_call")
	const [selectedDmTarget, setSelectedDmTarget] = createSignal<Connection>()
	const [dmList, setDmList] = createSignal<directMessages.groupedDM[][]>([], { equals: false })
	const [dmError, setDmError] = createSignal("")
	const [selectedView, setSelectedView] = createSignal<SelectedView>()


	const exitRoom = async (roomId: string) => {
		console.log('exit room...')
		const response = await server.exitRoom(roomId)
		console.log('...exit room', response.ok)

		setCallState("no_call")
	}

	const room = createMemo(() => server.rooms.find(r => r.id === server.self()?.roomId))

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
		if(selectedView() === 'chat') {
			scrollLatestMessageIntoView()
		}
	})

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

	const connectionsInRoom = () => server.connections.filter(sc => server.self()?.roomId && sc.id != server.self()?.id && sc.roomId === server.self()?.roomId)
	const connectedFriends = () => server.connections.filter(c => !hasSelfIdentity(c) && isFriend(c))
	const isRoomOwner = (c: Connection) => server.rooms.find(room => room.id === c.roomId)?.ownerId === c.id;
	const isOnline = (c: Connection) => c.status === 'online'
	const hasIdentity = (c: Connection) => !!c?.identity
	const hasPendingFriendRequest = (c: Connection) => server.friendRequests.some(fr => fr.toId === c.identity?.id)
	const hasFriendRequest = (c: Connection) => server.friendRequests.some(fr => fr.fromId === c.identity?.id)
	const isFriend = (c: Connection) => server.friends.some(f => f.friendId === c.identity?.id)
	const isUnknown = (c: Connection) => !hasSelfIdentity(c) && !hasSameIdentity(c, server.self()) && !isFriend(c) && (hasIdentity(c) || isOnline(c))
	const hasSelfIdentity = (c: Connection) => c.id === server.self()?.id
	const hasSameIdentity = (c1: Connection, c2: Connection) => c1?.identity && c2?.identity && c1?.identity?.id === c2?.identity?.id
	const hasUnknownConnections = () => server.connections.some(c => isUnknown(c))
	const canFriendRequest = (c: Connection) =>
		hasIdentity(server.self())
		&& hasIdentity(c)
		&& !hasSameIdentity(c, server.self())
		&& !hasSelfIdentity(c)
		&& !isFriend(c)
		&& !hasFriendRequest(c)
		&& !hasPendingFriendRequest(c)

	const onMessageKeyDown = async (e: KeyboardEvent, con: Connection) => {
		const input = e.target as HTMLTextAreaElement
		const message = input.value?.trim()
		if (e.key === 'Enter' && message) {
			input.value = '';
			sendDm(con, message);
		}
	}

	const onSendButtonClick = async (input: HTMLTextAreaElement, con: Connection) => {
		const message = input.value?.trim()
		if (message) {
			input.value = '';
			sendDm(con, message);
		}
	}

	async function sendDm(con: Connection, message: string) {
		try {
			const self = server.self();
			const dm: DM = {
				toId: con.id,
				fromId: self.id,
				fromName: self.identity?.name,
				message,
				kind: "text"
			}
			await directMessages.sendDm(dm, con.publicKey);
			updateDmDisplay(dm);
		} catch (err) {
			setDmError(err.message);
		}
	}


	directMessages.onNewMessage((dm: DM) => {
		updateDmDisplay(dm)
	})

	async function updateDmDisplay(dm: DM) {

		const fromCon = server.connections.find(c => c.id === dm.fromId)
		const toCon = server.connections.find(c => c.id === dm.toId)

		//handle messages from self on a different connection
		const con = isSelf(fromCon) ? toCon : fromCon

		//update our local display of messages
		const targetId = selectedDmTarget()?.id
		console.log({ conId: con.id, targetId })
		if (con.id === targetId) {
			const messages = await directMessages.getRecentHistory(con.id, con.publicKey)
			const latestMessage = messages[messages.length - 1]
			const groupedBySender = directMessages.groupBySender(messages)
			setDmList(groupedBySender)
			scrollLatestMessageIntoView()
			directMessages.setLastReadTimestamp(con.id, latestMessage.timestamp)
		}
	}

	const unreadLabel = (c: Connection) => {
		const value = directMessages.unreadCountByConId()[c.id]
		return value ? `${value} unread` : ''
	}

	const avatarUrl = (conId: string) => {
		const con = server.connections.find(c => c.id === conId)
		return con?.identity?.avatar_url
	}

	const showDmConversation = async (con: Connection) => {
		setDmError(null)
		setSelectedDmTarget(con)

		if (!con) return
		if (!con.publicKey) {
			setDmError(`Cannot enctypt messages to ${con.identity?.name}! They need to sign in to generate a public key.`)
			return
		}
		try {
			let history = await directMessages.getRecentHistory(con.id, con.publicKey)
			const lastRead = directMessages.lastReadTimestamp(con.id)

			console.log('showDmConversation', { lastRead, history })

			//TODO: visually mark each message after the timestamp as unread

			const groupedBySender = directMessages.groupBySender(history)
			setDmList(groupedBySender)
			scrollLatestMessageIntoView()
			directMessages.setLastReadNow(con.id)

			console.log('lastReadDmByConId', lastRead)
		} catch (err) {
			setDmError(err.message)
		}
	}

	const scrollLatestMessageIntoView = () => {
		const dmElements = Array.from(document.getElementsByClassName('dm'));
		dmElements[dmElements.length - 1]?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
	}
		

	const logout = () => {
		showDmConversation(null)
		server.becomeAnonymous()
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
						<div class="avatar button" onclick={logout}>
							<div class="name">{server.self()?.identity.name}</div>
							<img alt={server.self()?.identity?.name} src={server.self()?.identity.avatar_url} />
						</div>
					</Show>

				</div>
			</div>


			<div class={`middle ${callState()}`}>
				<Show when={selectedView() === '3d'}>
					<Planet />
				</Show>
				<Show when={selectedView() === 'graph'}>
					<ConnectionsGraph self={server.self()} connections={server.connections} />
				</Show>
				<Show when={selectedView() === 'chat'}>
					<div class="chat">
						<Show when={!selectedDmTarget()}>
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

												<button class="dm-button" onclick={() => showDmConversation(c)}>💬</button>
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
						</Show>
						<Show when={selectedDmTarget()}>
							<div class="dm-chat">
								<div class="dm-header">
									<span>Chat with {selectedDmTarget()?.identity?.name}</span>
									<button onclick={() => showDmConversation(null)}>close</button>
								</div>
								<Show when={dmError()}>ERROR: {dmError()}</Show>
								<Show when={!dmError()}>
									<div class="dm-list">
										<For each={dmList()}>
											{dmGroup => {
												const firstMessage = dmGroup[0]
												const diff = diffTime(firstMessage.timestamp, firstMessage.prevTimestamp)
												const moreMessages = dmGroup.slice(1)
												return <>
													<Show when={diff}><div class="dm-diffTime">{diff}</div></Show>
													<div class="dm">
														<div class="dm-avatar">
															<img alt={firstMessage.fromName} src={avatarUrl(firstMessage.fromId)} />
														</div>
														<div class="dm-first-message">
															<div class="dm-sender">
																{firstMessage.fromName || firstMessage.fromId}
															</div>
															<div class="dm-timestamp">
																{ageTimestamp(firstMessage.timestamp)}
															</div>
															<div class="dm-content">{firstMessage.message as string}</div>
														</div>
														<For each={moreMessages}>{(dm) => {
															const diff2 = diffTime(dm.timestamp, dm.prevTimestamp)
															return <>
																<Show when={diff2}><div class="dm-diffTime">{diff2}</div></Show>
																<div class="dm-message">
																	<span class="dm-timestamp">{shortTime(dm.timestamp)}</span>
																	<span class="dm-content">{dm.message as string}</span>
																</div>
															</>
														}
														}</For>
													</div>
												</>
											}}
										</For>
									</div>
									<div class="dm-send">
										<input
											class='dm-send-input'
											type="text"
											placeholder={`Message ${selectedDmTarget()?.identity?.name}...`}
											onKeyDown={(e) => onMessageKeyDown(e, selectedDmTarget())} />
										<button class='dm-send-button' onclick={(e) => onSendButtonClick(e.target.previousElementSibling as HTMLTextAreaElement, selectedDmTarget())}>⏎</button>
									</div>
								</Show>
							</div>
						</Show>
					</div>
				</Show>
				<Show when={selectedView() === 'call'}>

					<Show when={callState() === "no_call"}>
						<div class="centered-content">
							<button class="room-button" onclick={startCall}>start a public call</button>
						</div>
					</Show>
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
						connections={connectionsInRoom()} />
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
						<button class="room-button" onclick={() => setSelectedView('call')}>call</button>
					}
					<button class="room-button" onclick={() => setSelectedView('chat')}>chat</button>
					<button class="room-button" onclick={() => setSelectedView('3d')}>3D</button>
					<button class="room-button" onclick={() => setSelectedView('graph')}>graph</button>
				</div>
			</div>

		</Show>
	</>
};

render(() => <App />, document.body)
