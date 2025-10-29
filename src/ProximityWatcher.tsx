import { onCleanup, onMount } from "solid-js";
import { Avatar } from "./planet/avatar"
import { uiLog } from "./uiLog"
import * as videoCall from "./VideoCall";
import { intersections } from "./planet/planet";
import { IntersectionTarget } from "./planet/Intersections";
import { Area } from "./planet/area";
import { initiateCall } from "./data/data";

export default function ProximityWatcher() {
	uiLog(`Watching for intersections...`)
	
	const onStartIntersection = async (e: CustomEvent<IntersectionTarget>) => {
		
		if (e.detail instanceof Avatar) {
			var avatar = e.detail as Avatar
			const callResult = await initiateCall(avatar.connection)
			uiLog(`Start Call: ${avatar.label.text} ${JSON.stringify(callResult)}`)
			videoCall.ConnectVideo(avatar.connection?.id, callResult.polite)
		}
		else if(e.detail instanceof Area) {
			var area = e.detail as Area
			uiLog(`Entered Area: ${area.label.text}`)
		}
	}

	const onEndIntersection = (e: CustomEvent<Avatar>) => {
		
		if (e.detail instanceof Area) {
			var area = e.detail as Area
			uiLog(`Exited Area: ${area.label.text}`)
		}
		else if (e.detail instanceof Avatar) {
			var avatar = e.detail as Avatar
			videoCall.DisconnectVideo(avatar.connection?.id)
			uiLog(`End Call: ${avatar.label.text}`)
		} 
	}
	
	onMount(() => {
		intersections.addEventListener(intersections.event.enter, onStartIntersection)	
		intersections.addEventListener(intersections.event.exit, onEndIntersection)
	})
	onCleanup(() => {
		intersections.removeEventListener(intersections.event.enter, onStartIntersection)	
		intersections.removeEventListener(intersections.event.exit, onEndIntersection)
	})

	return <></>
}