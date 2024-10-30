import "./index.css"
import "./main.css"

import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import * as server from "./data";
import VideoCall from "./VideoCall";
import ConnectionsGraph from "./Connections";
import { trackStore } from "@solid-primitives/deep";

import type { Connection } from "../server/types"

type CallState = "no_call" | "server_wait" | "server_error" | "call_ready" | "call_connected"

const App = () => {

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

			{/* render this user */}
			<Show when={server.connections.find(con => con.id === server.id())}>
				{(con) => <User con={con()} />}
			</Show>
		</Show>
	</>
};

function User(props: { con: Connection }) {

	const exitRoom = async () => {
		console.log('exit room...')
		const response = await server.exitRoom(props.con.roomId)
		console.log('...exit room', response.ok)

		setCallState("no_call")
	}

	const room = createMemo(() => server.rooms.find(r => r.id === props.con.roomId))

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

	const becomeAnonymous = () => {
		server.becomeAnonymous()
	}


	createEffect(() => {
		trackStore(server.connections)

		// get raw connection objects out of the SolidJS Signal where they are proxies
		const connections = props.con.roomId && server.connections
			.map(node => Object.assign({}, node))
			.filter(node => node.roomId === props.con.roomId)

		//figure out how many connections are in the user's room
		if (!connections) {
			setCallState("no_call")
		} else if (connections?.length === 1) {
			setCallState("call_ready")
		} else if (connections?.length > 1) {
			setCallState("call_connected")
		}
	})

	const userId = () => {
		const id = server.id()
		return id.substring(id.length - 4)
	}


	return <div class="user-view">
		<div class={`middle ${callState()}`}>
			<ConnectionsGraph self={props.con} connections={server.connections} />
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
				user={props.con}
				room={room()}
				connections={server.connections.filter(sc => props.con.roomId && sc.id != props.con.id && sc.roomId === props.con.roomId)} />
		</div>
		<div class="toolbar">
			<div class="buttons">
				<Show when={!props.con.identity}>
					<div class="color-button">
						<input
							type="color"
							oninput={(e) => e.target.parentElement.style.backgroundColor = e.target.value}
							onchange={(e) => server.setColor(e.target.value)}
							value={props.con.color ?? 'transparent'} />

					</div>
				</Show>
				<Show when={!props.con.identity}>
					<a class="room-button" href={server.githubAuthUrl()?.toString()}>
						<svg height="16" width="16" viewBox="0 0 16 16" version="1.1" aria-hidden="true">
							<path
								d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
								fill-rule="evenodd"
								fill="currentColor"></path>
						</svg>
						login</a>
				</Show>
				<Show when={props.con.identity}>
					<div class="avatar" onclick={becomeAnonymous}>
						<img src={props.con.identity.avatar_url} />
						<div>{props.con.identity.name}</div>
					</div>
				</Show>

				{props.con.roomId &&
					<button class="room-button" onclick={exitRoom}>
						{isRoomOwner(props.con) ? "End" : "Leave"} call
					</button>
				}
				{!props.con.roomId &&
					<button class="room-button" onclick={startCall}>start call</button>
				}
			</div>
			<div class="server">{userId()}</div>
		</div>
	</div>
}

function isRoomOwner(con: Connection) {
	return server.rooms.find(room => room.id === con.roomId)?.ownerId === con.id;
}

render(() => <App />, document.getElementById("root"));
