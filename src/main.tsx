import "./index.css"
import "./main.css"

import { For, Match, onMount, Show, Switch } from "solid-js";
import { render } from "solid-js/web";
import server from "./data";
import type { Connection, Room } from "../server/api";
import VideoCall from "./VideoCall";
import ConnectionsGraph from "./Connections";

const roomShortId = (room: Room) => room?.id.substring(room.id.length - 4)

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
	}

	return <div class="user-view">
		<div class="them">
			<Show when={props.con.roomId}>
				<VideoCall 
				user={props.con} 
				room={server.rooms.find(r => r.id === props.con.roomId)} 
				connections={server.connections.filter(sc => sc.id != props.con.id && sc.roomId === props.con.roomId)} />
			</Show>

			<Switch>
				{/* NOT IN A ROOM */}
				<Match when={!props.con.roomId}>
					<ConnectionsGraph connections={server.connections} />
					<Rooms rooms={server.rooms.filter(room => room.ownerId !== props.con.id)} />
					{/* <Connections connections={server.connections.filter(con => con.id !== server.id() && !con.roomId)} /> */}
				</Match>
				{/* CREATED A ROOM */}
				{/* <Match when={server.rooms.some(room => room.ownerId === props.con.id)}>
					<Connections connections={server.connections.filter(sc => sc.id != props.con.id && sc.roomId === props.con.roomId)} />
				</Match> */}
				{/* JOINED A ROOM */}
				{/* <Match when={server.rooms.some(room => room.ownerId !== props.con.id)}>
					<Connections connections={server.connections.filter(sc => sc.id != props.con.id && sc.roomId === props.con.roomId)} />
				</Match> */}
			</Switch>
		</div>
		{/* style={{ "background-color": props.con.color }} */}
		<div class="toolbar">
			<div class="public-info">
				<RoomLabel con={props.con} />
				<input
					type="text"
					maxlength="123"
					placeholder="status message"
					onchange={(e) => server.setText(e.target.value)}
					onfocus={(e) => e.target.setSelectionRange(0, e.target.value.length)}
					value={props.con.text ?? ''} />
			</div>
			<div class="buttons">
				<div class="color-button">
					<span>color</span>
					<input
						type="color"
						oninput={(e) => e.target.parentElement.style.backgroundColor = e.target.value}
						onchange={(e) => server.setColor(e.target.value)}
						value={props.con.color} />

				</div>

				{props.con.roomId &&
					<button class="room-button" onclick={exitRoom}>
						{isRoomOwner(props.con) ? "End" : "Leave"} call
					</button>
				}
				{!props.con.roomId &&
					<button class="room-button" onclick={() => server.createRoom()}>start call</button>
				}
			</div>
		</div>
	</div>
}

function isRoomOwner(con: Connection) {
	return server.rooms.find(room => room.id === con.roomId)?.ownerId === con.id;
}

function RoomLabel(props: { con: Connection }) {
	return <Show when={server.rooms.find(room => room.id === props.con.roomId)}>
		<div>call {roomShortId(server.rooms.find(room => room.id === props.con.roomId))}</div>
		<div>{server.connections.reduce((count, c) => count += (c.roomId === props.con.roomId ? 1 : 0), 0)} people</div>
	</Show>
}

function countUsers(room: Room) {
	return server.connections.reduce((count, c) => count += (c.roomId === room.id ? 1 : 0), 0);
}

function ownerColor(room: Room) {
	const owner = server.connections.find(con => room.ownerId === con.id)
	return owner?.color
}

const Rooms = (props: { rooms: Room[] }) => {
	return <Show when={props.rooms.length > 0}>
		<div class="rooms">
			<For each={props.rooms}>
				{room => {
					return <div class="room-button"
						style={{ "background-color": ownerColor(room) }}
						onclick={() => server.joinRoom(room.id)}>
						join call {roomShortId(room)}
						<div class="userCount">{countUsers(room)} inside</div>
					</div>
				}}
			</For>
		</div>
	</Show>
}

const Connections = (props: { connections: Connection[] }) => {
	return <div class="connections">
		<For each={props.connections}>
			{(con) => <div
				class="connection"
				style={{ "background-color": con.color }}>
				<h2 textContent={con.text || ""}></h2>
				<h2>{con.status === "online" ? "👀" : "😴"}</h2>
				<Show when={server.rooms.find(room => room.id === con.roomId)?.ownerId === con.id}>
					OWNER
				</Show>
			</div>}
		</For>
	</div>
}

render(() => <App />, document.getElementById("root"));
