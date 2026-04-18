import * as solid from "solid-js"
import * as planet from "./planet/planet";
import * as server from "./data/data";
import { IntersectionTarget } from "./planet/Intersections";
import { IconButton } from "./component/MediaButton";
import { shortId } from "./helpers";
import { Area } from "./planet/area";
import { uiLog } from "./uiLog";

function Card(props: { area: Area }) {

	const [holder, setHolder] = solid.createSignal<string>()

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
				uiLog(`failed to release ${shortId(props.area.uuid)} on the server!`)
		}
		else {
			const response = await server.grabArea(props.area.uuid)
			if (response.ok) {
				props.area.grab(planet.getSelfAvatar())
				setHolder(props.area.holder?.label.text)
			}
			else
				uiLog(`failed to grab ${shortId(props.area.uuid)} on the server!`)
		}
	}

	return <div class="card" style={{outline: holder() ? '2px solid yellow' : null}} onclick={action}>
		<div>{props.area.params.ownerName}</div>
		<div style="display:flex; gap:0.5rem;">
			{holder() && <span>drop</span>}
			{!holder() && <span>grab</span>}
			<span>{shortId(props.area.uuid)}</span>
		</div>
	</div>
}

export function AreaProximityCards() {
	const [intersectedAreas, setIntersectedAreas] = solid.createSignal<Area[]>([])

	const onStartIntersection = async (e: CustomEvent<IntersectionTarget>) => {
		if (!(e.detail instanceof Area)) return

		// console.log(`start intersection`, shortId(e.detail.uuid))
		setIntersectedAreas([e.detail, ...intersectedAreas()])
	}

	const onEndIntersection = (e: CustomEvent<IntersectionTarget>) => {
		if (!(e.detail instanceof Area)) return

		// console.log(`end intersection`, shortId(e.detail.uuid))
		const index = intersectedAreas().indexOf(e.detail)
		if (index < 0) {
			console.warn(`index not found`, index)
			return
		}
		setIntersectedAreas(intersectedAreas().toSpliced(index, 1))
	}

	solid.onMount(() => {
		planet.intersections.addEventListener(planet.intersections.event.enter, onStartIntersection)
		planet.intersections.addEventListener(planet.intersections.event.exit, onEndIntersection)
		console.log(`Cards - mounted`)
		uiLog(`Started watching area intersections...`)
	})
	solid.onCleanup(() => {
		planet.intersections.removeEventListener(planet.intersections.event.enter, onStartIntersection)
		planet.intersections.removeEventListener(planet.intersections.event.exit, onEndIntersection)
		console.log(`Cards - cleanup`)
		uiLog(`Stopped watching area intersections...`)
	})

	return <div class="cards">
		<solid.For each={intersectedAreas()} fallback={<div>nothing nearby</div>}>
			{(item) => <Card area={item} />}
		</solid.For>
	</div>
}
