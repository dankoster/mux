import * as solid from "solid-js"
import { onCleanup, onMount } from "solid-js";
import { Avatar } from "./planet/entity/avatar"
import { uiLog } from "./uiLog"
import * as videoCall from "./VideoCall";
import * as planet from "./planet/planet";
import { IntersectionTarget } from "./planet/Intersections";
import * as server from "./data/data";
import { SSEventPayload } from "../server/types";

//this watches for intersection with other avatars. When an intersection occurs
// it just calls ConnectVideo. 
//
//What SHOULD happen is popping up of a UI containing the target avatar's current
// prefered method of communicating: dnd, emotes, ephemeral chat, encrypted chat, video 
// 
//If both avatars are sharing video then just connect
// the video streams. If one of the avatars is only making chat available then 
// pop up the chat. There should be levels of interaction. If one of the avatars is hiding then
// prompt to open a chat or call.
//
// turn on local video stream when enabling video calling
// show local video in a small viewer on or near the user button
// 
// use view transitions to move always on video from user button to call view


export default function AvatarProximityCall() {
	
	//const [intersected, setIntersected] = solid.createSignal<Avatar[]>([])
	
	const onInitiateCallFromServer = async (event: SSEventPayload) => {
		if(!event.data) throw new Error(`${event.data} is ${event.data}`)

		const callingConId = event.data
		const callingAvatar = planet.getAvatarById(callingConId)

		uiLog(`Answering connection from ${callingAvatar?.label?.text}`)
		console.log(`Answering connection from `, callingAvatar?.label?.text)
		
		
		const callResult = await server.initiateCall(callingConId)
		await videoCall.Connect({
			conId: callingConId,
			rtcConfig: callResult.peerConfig,
			polite: callResult.polite
		})
	}
	
	const onStartIntersection = async (e: CustomEventInit<IntersectionTarget>) => {
		if (e.detail instanceof Avatar) {
			const avatar = e.detail as Avatar
			//setIntersected([...intersected(), avatar])

			if(!avatar.connection) throw new Error(`${avatar.connection} is ${avatar.connection}`)
			
			uiLog(`Connecting to ${avatar.label?.text}`)
			console.log(`Connecting to`, avatar.label?.text)
			
			const callResult = await server.initiateCall(avatar.connection.id)
			await videoCall.Connect({
				conId: avatar.connection?.id,
				rtcConfig: callResult.peerConfig,
				polite: callResult.polite
			})
		}
	}
	
	const onEndIntersection = (e: CustomEventInit<Avatar>) => {
		if (e.detail instanceof Avatar) {
			var avatar = e.detail as Avatar
			// const index = intersected().findIndex(i=> i == avatar)
			// if (index < 0) {
			// 	uiLog(`ERROR! onEndIntersection cannot find avatar`)
			// 	return
			// }
			// setIntersected(intersected().toSpliced(index, 1))
			console.log(`onEndIntersection`, avatar.label?.text)
			videoCall.Disconnect(avatar.connection.id)
		}
	}
	
	onMount(() => {
		const intersections = planet.getIntersections()
		intersections.addEventListener(intersections.event.enter, onStartIntersection)
		intersections.addEventListener(intersections.event.exit, onEndIntersection)
		server.addServerSentEventHandler("initiateCall", onInitiateCallFromServer)
		uiLog(`Started watching avatars`)
		console.log(`onMount`)
	})
	onCleanup(() => {
		const intersections = planet.getIntersections()
		intersections.removeEventListener(intersections.event.enter, onStartIntersection)
		intersections.removeEventListener(intersections.event.exit, onEndIntersection)
		server.removeServerSentEventHandler("initiateCall", onInitiateCallFromServer)
		uiLog(`Stopped watching avatars`)
		console.log(`onCleanup`)
	})

	return <></>
	
	// <div class="cards">
	// 	<solid.For each={intersected()} fallback={<div id="AvatarProximityCall">no avatar intersections</div>}>
	// 		{(avatar) => <div id="AvatarProximityCall" class="card">
	// 			<div>{avatar.label.text}</div>
	// 			{/* TODO: show chat? */}
	// 		</div>}
	// 	</solid.For>
	// </div>
}