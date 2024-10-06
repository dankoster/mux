import "./index.css"
import "./main.css"

import { For, Match, onMount, Show, Switch } from "solid-js";
import { render } from "solid-js/web";
import server from "./data";
import type { Connection, Room } from "../server/api";
import VideoCall from "./VideoCall";

const roomShortId = (room: Room) => room?.id.substring(room.id.length - 4)

const App = () => {

	return <>
		<Show when={!server.serverOnline()}>
			<div class="offlineMessage">connecting...</div>
		</Show>
		<Show when={server.serverOnline()}>
			<div class="header">
				<h1 class="logo">⨳ MUX</h1>
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
	
	let ref: HTMLInputElement;
	onMount(() => {
		ref?.focus();
	});
	
	return <>
		<div class="me" style={{ "background-color": props.con.color }}>
			<input
				ref={ref}
				type="text"
				maxlength="123"
				placeholder="Leave a message! 👋 🌈 👉"
				onchange={(e) => server.setText(e.target.value)}
				onfocus={(e) => e.target.setSelectionRange(0, e.target.value.length)}
				value={props.con.text ?? ''} />
			<input
				type="color"
				oninput={(e) => e.target.parentElement.style.backgroundColor = e.target.value}
				onchange={(e) => server.setColor(e.target.value)}
				value={props.con.color} />
			{props.con.roomId && <button class="room-button" onclick={() => server.exitRoom(props.con.roomId)}>
				{server.rooms.find(room => room.id === props.con.roomId)?.ownerId === props.con.id ? "Close" : "Leave"} room
			</button>}
			{!props.con.roomId && <button class="room-button" onclick={() => server.createRoom()}>open room</button>}
			<RoomLabel con={props.con} />
		</div>
		<Show when={props.con.roomId}>
			<VideoCall roomID={props.con.roomId}/>
		</Show>

		<Switch>
			<Match when={!props.con.roomId}>
				{/* NOT IN A ROOM */}
				<Rooms rooms={server.rooms.filter(room => room.ownerId !== props.con.id)} />
				<Connections connections={server.connections.filter(con => con.id !== server.id() && !con.roomId)} />
			</Match>
			<Match when={server.rooms.some(room => room.ownerId === props.con.id)}>
				{/* CREATED A ROOM */}
				<Connections connections={server.connections.filter(sc => sc.id != props.con.id && sc.roomId === props.con.roomId)} />
			</Match>
			<Match when={server.rooms.some(room => room.ownerId !== props.con.id)}>
				{/* JOINED A ROOM */}
				<Connections connections={server.connections.filter(sc => sc.id != props.con.id && sc.roomId === props.con.roomId)} />
			</Match>
		</Switch>
	</>
}

function RoomLabel(props: { con: Connection }) {
	return <Show when={server.rooms.find(room => room.id === props.con.roomId)}>
		<div>room {roomShortId(server.rooms.find(room => room.id === props.con.roomId))}</div>
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
						room {roomShortId(room)}
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
				<h2 textContent={con.text || "🌈 🤔"}></h2>
				<h2>{con.status === "online" ? "👀" : "😴"}</h2>
				<Show when={server.rooms.find(room => room.id === con.roomId)?.ownerId === con.id}>
					OWNER
				</Show>
			</div>}
		</For>
	</div>
}

render(() => <App />, document.getElementById("root"));
