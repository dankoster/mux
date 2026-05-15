import * as solid from "solid-js"
import * as planet from "./planet/planet";
import * as server from "./data/data";
import { IntersectionTarget } from "./planet/Intersections";
import { shortId } from "./helpers";
import { Area } from "./planet/area";
import { uiLog } from "./uiLog";
import { AreaNotification, SSEventPayload } from "../server/types";
import { Avatar } from "./planet/avatar";
import { RenderSnapshot64 } from "./planet/snapshot";

function Card(props: { area: Area }) {

	const [holder, setHolder] = solid.createSignal<string>()
	let imgSnapshot: HTMLImageElement


	//TODO: make this action come from the thing the card is representing
	const action = async () => {
		if (props.area.holder) {
			const response = await server.releaseArea({
				conId: props.area.holder.connection?.id,
				areaId: props.area.uuid,
				position: props.area.holder.mesh.position
			})
			if (response.ok) {
				props.area.release()
				setHolder()
			}
			else
				uiLog(`Failed to release ${shortId(props.area.uuid)}!`)
		}
		else {
			const response = await server.grabArea(props.area.uuid)
			if (response.ok) {
				props.area.grab(planet.getSelfAvatar())
				setHolder(props.area.holder?.label.text)
			}
			else
				uiLog(`Access denied, cannot grab ${shortId(props.area.uuid)}!`)
		}
	}

	solid.onMount(async () => {
		imgSnapshot.src = await RenderSnapshot64(props.area?.model?.scene);
	})

	return <div class="card" style={{ outline: holder() ? '2px solid yellow' : null }} onclick={action}>
		<img class="snapshot" ref={imgSnapshot}></img>
		<div class="details">
			<div>{props.area.params.ownerName}</div>
			<div class="action">
				<span>click to</span>
				{holder() && <span>drop</span>}
				{!holder() && <span>grab</span>}
			</div>
			<span>{shortId(props.area.uuid)}</span>
		</div>
	</div>
}

export function AreaProximityCards() {
	const [intersectedAreas, setIntersectedAreas] = solid.createSignal<Area[]>([])

	const onGrabArea = (payload: SSEventPayload) => {
		const an = JSON.parse(payload.data) as AreaNotification
		const avatar = planet.getAvatarById(an.conId)
		const area = planet.getAreaById(an.areaId)
		area?.grab(avatar)
	}
	const onReleaseArea = (payload: SSEventPayload) => {
		const an = JSON.parse(payload.data) as AreaNotification
		const avatar = planet.getAvatarById(an.conId)
		const area = planet.getAreaById(an.areaId)
		area?.release(avatar)
	}

	const onStartIntersection = async (e: CustomEvent<IntersectionTarget>) => {
		if (!(e.detail instanceof Area)) return

		setIntersectedAreas([e.detail, ...intersectedAreas()])
	}

	const onEndIntersection = (e: CustomEvent<IntersectionTarget>) => {
		if (!(e.detail instanceof Area)) return

		const index = intersectedAreas().indexOf(e.detail)
		if (index < 0) {
			console.warn(`index not found`, index)
			return
		}
		setIntersectedAreas(intersectedAreas().toSpliced(index, 1))
	}

	let selfAvatar: Avatar = null
	let spaceDown = false

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === ' ' && !spaceDown && e.target === document.body) {
			spaceDown = true
			if (!selfAvatar) selfAvatar = planet.getSelfAvatar()
			console.log('keyDown', selfAvatar, intersectedAreas())
			//TODO: only grab ungrabbed areas
			intersectedAreas()?.forEach(area => area.grab(selfAvatar))
		}
	}

	const onKeyUp = (e: KeyboardEvent) => {
		if (e.key === ' ' && e.target === document.body) {
			spaceDown = false
			console.log('keyUp')
			//TODO: only release grabbed areas
			intersectedAreas()?.forEach(area => area.release(selfAvatar))
		}
	}

	solid.onMount(() => {
		document.addEventListener('keydown', onKeyDown)
		document.addEventListener('keyup', onKeyUp)
		const intersections = planet.getIntersections()
		intersections.addEventListener(intersections.event.enter, onStartIntersection)
		intersections.addEventListener(intersections.event.exit, onEndIntersection)
		server.addServerSentEventHandler('grabArea', onGrabArea)
		server.addServerSentEventHandler('releaseArea', onReleaseArea)
		uiLog(`Started watching areas`)
	})
	solid.onCleanup(() => {
		document.removeEventListener('keydown', onKeyDown)
		document.removeEventListener('keyup', onKeyUp)
		const intersections = planet.getIntersections()
		intersections.removeEventListener(intersections.event.enter, onStartIntersection)
		intersections.removeEventListener(intersections.event.exit, onEndIntersection)
		server.removeServerSentEventHandler('grabArea', onGrabArea)
		server.removeServerSentEventHandler('releaseArea', onReleaseArea)
		uiLog(`Stopped watching areas`)
	})

	return <div class="cards">
		<solid.For each={intersectedAreas()} fallback={<div>nothing nearby</div>}>
			{(item) => <Card area={item} />}
		</solid.For>
	</div>
}
