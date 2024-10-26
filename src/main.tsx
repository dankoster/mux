import "./index.css"
import "./main.css"

import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import * as server from "./data";
import type { Connection } from "../server/api";
import VideoCall from "./VideoCall";
import ConnectionsGraph from "./Connections";
import { trackStore } from "@solid-primitives/deep";

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
					<a class="room-button" href={server.githubAuthUrl()?.toString()}>github auth</a>
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
