import * as THREE from 'three'
import { Connection } from '../../server/types'
import { Labeled } from './Labeled'
import { Interactable } from './Interactable'

export class Avatar extends EventTarget {
	mesh: THREE.Mesh
	connection?: Connection
	prevDistanceFromSelf: number = undefined
	prevDistanceLocation: THREE.Vector3 = undefined
	lastBroadcastPosition: THREE.Vector3 = new THREE.Vector3
	lastBroadcastDistanceFromSelf: number = 0
	
	interactable: Interactable
	label: Labeled
	
	private _distanceFromSelf: number = 0

	constructor(size: number, color?: number, x: number = 0) {
		super()
		const material = color ? new THREE.MeshPhongMaterial({ color }) : new THREE.MeshNormalMaterial();
		const boxGeometry = new THREE.BoxGeometry(size, size, size)
		this.mesh = new THREE.Mesh(boxGeometry, material)
		this.mesh.position.x = x
		this.interactable = new Interactable(this.mesh, size)
		this.label = new Labeled(this.mesh, )
	}

	setPositionAndLook({ position, lookTarget }: { position: THREE.Vector3Like, lookTarget?: THREE.Vector3 }) {
		if (!position) {
			console.warn(`Tried to set position with position == ${position}`, this)
			return
		}

		if (!this.mesh?.position?.equals(position)) {
			this.mesh.position.copy(position)
		}

		if (lookTarget)
			this.mesh.lookAt(lookTarget)
	}

	set distanceFromSelf(value: number) {
		this.prevDistanceFromSelf = this._distanceFromSelf;
		this.prevDistanceLocation = this.mesh.position;

		this._distanceFromSelf = value;

		this.label.opacity = `${100 - (this._distanceFromSelf * 3)}%`;
	}

	get distanceFromSelf() {
		return this._distanceFromSelf;
	}

	delete() {
		console.log('avatar delete!', this.connection.identity?.name);
		this.mesh.removeFromParent();
		this.label.remove();
	}
}
