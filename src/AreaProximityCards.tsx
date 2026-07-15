import * as solid from "solid-js"
import * as planet from "./planet/planet";
import { IntersectionTarget } from "./planet/Intersections";
import { shortId } from "./helpers";
import { Area } from "./planet/entity/area";
import { uiLog } from "./uiLog";

export function AreaProximityCards() {
	const [intersectedAreas, setIntersectedAreas] = solid.createSignal<Area[]>([])

	const onStartIntersection = (e: CustomEventInit<IntersectionTarget>) => {
		if (!(e.detail instanceof Area)) return

		setIntersectedAreas([e.detail, ...intersectedAreas()])
	}

	const onEndIntersection = (e: CustomEventInit<IntersectionTarget>) => {
		if (!(e.detail instanceof Area)) return

		const index = intersectedAreas().indexOf(e.detail)
		if (index < 0) {
			console.warn(`index not found`, index)
			return
		}
		setIntersectedAreas(intersectedAreas().toSpliced(index, 1))
	}

	// let selfAvatar: Avatar | undefined
	// let spaceDown = false

	// const onKeyDown = (e: KeyboardEvent) => {
	// 	if (e.key === ' ' && !spaceDown && e.target === document.body) {
	// 		spaceDown = true
	// 		if (!selfAvatar) selfAvatar = planet.getSelfAvatar()
	// 		console.log('keyDown', selfAvatar, intersectedAreas())
	// 		//TODO: only grab ungrabbed areas
	// 		intersectedAreas()?.forEach(area => area.movable?.grab(selfAvatar))
	// 	}
	// }

	// const onKeyUp = (e: KeyboardEvent) => {
	// 	if (e.key === ' ' && e.target === document.body) {
	// 		spaceDown = false
	// 		console.log('keyUp')
	// 		//TODO: only release grabbed areas
	// 		intersectedAreas()?.forEach(area => area.movable?.release(selfAvatar))
	// 	}
	// }

	solid.onMount(() => {
		// document.addEventListener('keydown', onKeyDown)
		// document.addEventListener('keyup', onKeyUp)
		const intersections = planet.getIntersections()
		intersections.addEventListener(intersections.event.enter, onStartIntersection)
		intersections.addEventListener(intersections.event.exit, onEndIntersection)
		uiLog(`Started watching areas`)
	})
	solid.onCleanup(() => {
		// document.removeEventListener('keydown', onKeyDown)
		// document.removeEventListener('keyup', onKeyUp)
		const intersections = planet.getIntersections()
		intersections.removeEventListener(intersections.event.enter, onStartIntersection)
		intersections.removeEventListener(intersections.event.exit, onEndIntersection)
		uiLog(`Stopped watching areas`)
	})

	return <div class="cards">
		<solid.For each={intersectedAreas()} fallback={<div>nothing nearby</div>}>
			{(item) => <Card area={item} />}
		</solid.For>
	</div>
}

function Card(props: { area: Area }) {

	return <div class="card" style={{ outline: props.area.movable?.holder() ? '2px solid yellow' : undefined }}>
		<img class="snapshot" src={props.area.ImageUrl}></img>
		<div class="details">
			<div class="info"><label>uuid</label>{shortId(props.area.uuid)}</div>
			<div class="info"><label>owner</label>{props.area.params.ownerName}</div>
			<div>
				<button onclick={props.area.movable?.defaultAction}>{props.area.movable?.holder() ? 'drop' : 'grab'}</button>
				{props.area.deletable && <button onclick={props.area.deletable.delete}>delete</button>}
			</div>
		</div>
	</div>
}
