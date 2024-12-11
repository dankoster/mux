import { trackStore } from "@solid-primitives/deep"
import { createEffect, createMemo, createSignal, Show } from "solid-js"
import VideoCall from "./VideoCall"
import * as server from "./data/data";
import { Connection } from "../server/types";

type CallState = "no_call" | "server_wait" | "server_error" | "call_ready" | "call_connected"

export const Call = () => {
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

	const exitCall = async (roomId: string) => {
		console.log('exit room...')
		const response = await server.exitRoom(roomId)
		console.log('...exit room', response.ok)

		setCallState("no_call")
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

	const isRoomOwner = (c: Connection) => server.rooms.find(room => room.id === c.roomId)?.ownerId === c.id;


	return <>
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
			room={server.room()}
			connections={server.connectionsInRoom()} />
		{
			server.self()?.roomId &&
			<div class="centered-content">
				<button class="room-button" onclick={() => exitCall(server.self()?.roomId)}>
					{isRoomOwner(server.self()) ? "End" : "Leave"} call
				</button>
			</div>

		}
	</>
}