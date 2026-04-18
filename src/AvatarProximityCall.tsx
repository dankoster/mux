import * as solid from "solid-js"
import { onCleanup, onMount } from "solid-js";
import { Avatar } from "./planet/avatar"
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

export default function AvatarProximityCall() {

	const onInitiateCall = async (event: SSEventPayload) => {
		const callingConId = event.data
		const callingAvatar = planet.getAvatarById(callingConId)

		//TODO: ask the user if they want to answer!
		uiLog(`Answering call from ${callingAvatar.label?.text}`)

		const callResult = await server.initiateCall(callingConId)
		await videoCall.ConnectVideo({
			conId: callingConId,
			rtcConfig: callResult.peerConfig,
			polite: callResult.polite
		})
	}

	const [intersected, setIntersected] = solid.createSignal<{avatar: Avatar,connected:boolean}[]>([])

	const startVideoCall = async (avatar: Avatar) => {
		uiLog(`Initiate Call: ${avatar.label.text}`)
		const callResult = await server.initiateCall(avatar.connection.id)
		uiLog(`Start Call: ${avatar.label.text}`)
		await videoCall.ConnectVideo({
			conId: avatar.connection?.id,
			rtcConfig: callResult.peerConfig,
			polite: callResult.polite
		})
		const index = intersected().findIndex(i=> i.avatar == avatar)
		setIntersected(intersected().toSpliced(index, 1, {avatar, connected:true}))

		uiLog(`Started Call: ${avatar.label.text}`)
	}

	const endVideoCall = async (avatar: Avatar) => {
		videoCall.DisconnectVideo(avatar.connection?.id)
		uiLog(`End Call: ${avatar.label.text}`)
	}

	const onStartIntersection = async (e: CustomEvent<IntersectionTarget>) => {
		if (e.detail instanceof Avatar) {
			const avatar = e.detail as Avatar
			setIntersected([...intersected(), {avatar, connected:false}])
		}
	}

	const onEndIntersection = (e: CustomEvent<Avatar>) => {
		if (e.detail instanceof Avatar) {
			var avatar = e.detail as Avatar
			const index = intersected().findIndex(i=> i.avatar == avatar)
			if (index < 0) {
				uiLog(`ERROR! onEndIntersection cannot find avatar`)
				return
			}
			setIntersected(intersected().toSpliced(index, 1))
		}
	}

	onMount(() => {
		planet.intersections.addEventListener(planet.intersections.event.enter, onStartIntersection)
		planet.intersections.addEventListener(planet.intersections.event.exit, onEndIntersection)
		server.addServerSentEventHandler("initiateCall", onInitiateCall)
		uiLog(`Started watching avatar intersections...`)
	})
	onCleanup(() => {
		planet.intersections.removeEventListener(planet.intersections.event.enter, onStartIntersection)
		planet.intersections.removeEventListener(planet.intersections.event.exit, onEndIntersection)
		server.removeServerSentEventHandler("initiateCall", onInitiateCall)
		uiLog(`Stopped watching avatar intersections...`)
	})

	return <div>
		<solid.For each={intersected()} fallback={<div>no avatar intersections</div>}>
			{({avatar, connected}) => <div>
				<div>{avatar.label.text}</div>
				{connected && <button onclick={() => endVideoCall(avatar)}>Stop Video</button>}
				{!connected && <button onclick={() => startVideoCall(avatar)}>Start Video</button>}
			</div>}
		</solid.For>
	</div>
}