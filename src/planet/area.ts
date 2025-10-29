import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Connection } from '../../server/types';
import { Labeled } from './Labeled';
import { Interactable } from './Interactable';

export type AreaParams = { 
	id?: string,
	size: number, 
	position?: THREE.Vector3Like,
	lookTarget?: THREE.Vector3,
	color?: number, 
	labelText?: string,
	labelClick?: (this: GlobalEventHandlers, ev: PointerEvent) => any,
}

export class Area {
	mesh: THREE.Mesh;
	connection?: Connection;
	id: string
	label: Labeled
	interactable: Interactable

	constructor(params : AreaParams) {	
		this.id = params.id ?? crypto.randomUUID()

		const material = params.color ? new THREE.MeshPhongMaterial({ color:params.color }) : new THREE.MeshNormalMaterial();
		const boxGeometry = new THREE.BoxGeometry(params.size, params.size, params.size);
		this.mesh = new THREE.Mesh(boxGeometry, material);

		this.label = new Labeled(this.mesh, params.labelText)
		this.label.labelDiv.onclick = params.labelClick
		this.label.labelDiv.style.pointerEvents = params.labelClick ? 'auto' : 'none';

		this.interactable = new Interactable(this.mesh, params.size)
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
		this.label.labelDiv.style.opacity = `${100 - (value * 3)}%`;
	}

	delete() {
		console.log('area delete!', this.connection?.identity?.name);
		this.mesh.removeFromParent();
		this.label.labelDiv.remove();
	}
}
