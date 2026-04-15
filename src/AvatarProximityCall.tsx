import { onCleanup, onMount } from "solid-js";
import { Avatar } from "./planet/avatar"
import { uiLog } from "./uiLog"
import * as videoCall from "./VideoCall";
import * as planet from "./planet/planet";
import { IntersectionTarget } from "./planet/Intersections";
import { initiateCall } from "./data/data";

export default function AvatarProximityCall() {
	
	const onStartIntersection = async (e: CustomEvent<IntersectionTarget>) => {
		if (e.detail instanceof Avatar) {
			const avatar = e.detail as Avatar
			const callResult = await initiateCall(avatar.connection.id)
			uiLog(`Start Call: ${avatar.label.text}`)
			await videoCall.ConnectVideo({
				conId: avatar.connection?.id, 
				rtcConfig: callResult.peerConfig, 
				polite: callResult.polite
			})
			uiLog(`Started Call: ${avatar.label.text}`)
		}
	}

	const onEndIntersection = (e: CustomEvent<Avatar>) => {
		if (e.detail instanceof Avatar) {
			var avatar = e.detail as Avatar
			videoCall.DisconnectVideo(avatar.connection?.id)
			uiLog(`End Call: ${avatar.label.text}`)
		} 
	}
	
	onMount(() => {
		planet.intersections.addEventListener(planet.intersections.event.enter, onStartIntersection)
		planet.intersections.addEventListener(planet.intersections.event.exit, onEndIntersection)
		uiLog(`Started watching avatar intersections...`)
	})
	onCleanup(() => {
		planet.intersections.removeEventListener(planet.intersections.event.enter, onStartIntersection)
		planet.intersections.removeEventListener(planet.intersections.event.exit, onEndIntersection)
		uiLog(`Stopped watching avatar intersections...`)
	})

	return <></>
}