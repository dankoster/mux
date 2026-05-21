import * as THREE from 'three';
import { AreaRecord } from '../../server/data/table/area';
import { Labeled } from './Labeled';
import { Avatar } from './avatar';
import { Movable } from './Movable';
import { Interactable } from './Interactable';
import { Deletable } from './Deletable';

export type AreaParams = AreaRecord & {
	lookTarget?: THREE.Vector3
	fromServer?: boolean
}

export class Area {
	uuid: string
	params: AreaParams
	mesh: THREE.Mesh
	ImageUrl: string | undefined
	lookTarget?: THREE.Vector3

	deletable: Deletable | undefined
	interactable: Interactable | undefined
	movable: Movable | undefined
	labeled: Labeled | undefined

	constructor(params: AreaParams) {
		this.uuid = params.uuid ?? crypto.randomUUID()
		this.params = params
		this.mesh = new THREE.Mesh();

		this.movable = new Movable(this, this.onAvatarMoved)
	}

	setPositionAndLook({ position, lookTarget }: { position: THREE.Vector3Like, lookTarget?: THREE.Vector3 }) {
		if (!position) {
			console.warn(`Tried to set position with position == ${position}`, this)
			return
		}

		if (!this.mesh?.position?.equals(position)) {
			this.mesh.position.copy(position)
		}

		if (lookTarget) {
			this.mesh.lookAt(lookTarget)
			this.lookTarget = lookTarget
		}
	}

	set distanceFromSelf(value: number | undefined) {
		if (!value || !this.labeled) return

		//TODO: move this into Labeled
		//set opacity of label based on distance from self avatar
		this.labeled.labelDiv.style.opacity = `${100 - (value * 3)}%`
	}

	delete() {
		this.mesh.removeFromParent();
		// this.complications.filter(c => c instanceof Labeled).forEach(l => l.labelDiv.remove())
		this.labeled?.labelDiv.remove()
	}

	private onAvatarMoved = (avatar: Avatar) => {
		this.setPositionAndLook({
			position: avatar?.mesh.position,
			lookTarget: this.lookTarget
		})

		//tell the server we moved it!
	}

}