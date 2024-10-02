import "./index.css"
import "./main.css"

import { For, Match, onMount, Show, Switch } from "solid-js";
import { render } from "solid-js/web";
import server from "./data";
import type { Connection, Room } from "../server/api";

const roomShortId = (room: Room) => room?.id.substring(room.id.length - 4)

const App = () => {

	let ref: HTMLInputElement;

	onMount(() => {
		ref?.focus();
	});

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
				{(con) => <>
					<div class="me" style={{ "background-color": con().color }}>
						<input
							ref={ref}
							type="text"
							maxlength="123"
							placeholder="Leave a message! 👋 🌈 👉"
							onchange={(e) => server.setText(e.target.value)}
							onfocus={(e) => e.target.setSelectionRange(0, e.target.value.length)}
							value={con().text ?? ''} />
						<input
							type="color"
							oninput={(e) => e.target.parentElement.style.backgroundColor = e.target.value}
							onchange={(e) => server.setColor(e.target.value)}
							value={con().color} />
						{con().roomId && <button class="room-button" onclick={() => server.exitRoom(con().roomId)}>
							{server.rooms.find(room => room.id === con().roomId)?.ownerId === con().id ? "Close" : "Leave"} room
						</button>}
						{!con().roomId && <button class="room-button" onclick={() => server.createRoom()}>open room</button>}
						<RoomLabel con={con()} />
					</div>
					<Switch>
						<Match when={!con().roomId}>
							{/* NOT IN A ROOM */}
							<Rooms rooms={server.rooms.filter(room => room.ownerId !== con().id)} />
							<Connections connections={server.connections.filter(con => con.id !== server.id() && !con.roomId)} />
						</Match>
						<Match when={server.rooms.some(room => room.ownerId === con().id)}>
							{/* CREATED A ROOM */}
							<Connections connections={server.connections.filter(sc => sc.id != con().id && sc.roomId === con().roomId)} />
						</Match>
						<Match when={server.rooms.some(room => room.ownerId !== con().id)}>
							{/* JOINED A ROOM */}
							<Connections connections={server.connections.filter(sc => sc.id != con().id && sc.roomId === con().roomId)} />
						</Match>
					</Switch>
				</>
				}
			</Show>
		</Show>
	</>
};

function RoomLabel(props: { con: Connection }) {
	return <Show when={server.rooms.find(room => room.id === props.con.roomId)}>
		<div>room {roomShortId(server.rooms.find(room => room.id === props.con.roomId))}</div>
	</Show>
}

const Rooms = (props: { rooms: Room[] }) => {
	function ownerColor(room: Room) {
		const owner = server.connections.find(con => room.ownerId === con.id)
		return owner.color
	}

	return <Show when={props.rooms.length > 0}>
		<div class="rooms">
			<For each={props.rooms}>
				{room => <div class="room-button"
					style={{ "background-color": ownerColor(room) }}
					onclick={() => server.joinRoom(room.id)}>room {roomShortId(room)}</div>}
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

