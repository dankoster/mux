import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Connection } from '../../server/types';


type AvatarEvent = "AvatarPositionChanged"
export const AvatarEvents: { [Property in AvatarEvent]: Property } = {
	AvatarPositionChanged: 'AvatarPositionChanged'
}

const AvatarPositionChanged = new Event(AvatarEvents.AvatarPositionChanged);

export class Avatar extends EventTarget {
	mesh: THREE.Mesh;
	connection?: Connection;
	prevDistance: number = 0;
	labelDiv: HTMLDivElement;
	private distance: number = 0;
	
	constructor(size: number, color?: number, x: number = 0) {
		super();
		const material = color ? new THREE.MeshPhongMaterial({ color }) : new THREE.MeshNormalMaterial();
		const boxGeometry = new THREE.BoxGeometry(size, size, size);
		const mesh = new THREE.Mesh(boxGeometry, material);
		mesh.position.x = x;

		const labelDiv = document.createElement('div');
		labelDiv.className = 'label';
		labelDiv.textContent = '';
		labelDiv.style.backgroundColor = 'transparent';
		labelDiv.style.pointerEvents = 'none';

		const label = new CSS2DObject(labelDiv);
		label.position.set(1.5 * size, 0, 0);
		label.center.set(0, 1);
		mesh.add(label);
		label.layers.set(0);

		this.labelDiv = labelDiv;
		this.mesh = mesh;
	}

	setPositionAndLook({ position, lookTarget }: { position: THREE.Vector3Like, lookTarget?: THREE.Vector3 }) {
		if (!this.mesh.position.equals(position)) {
			this.mesh.position.copy(position)
			this.dispatchEvent(AvatarPositionChanged)
		}

		if (lookTarget)
			this.mesh.lookAt(lookTarget)
	}

	get label() {
		return this.labelDiv.textContent;
	}
	set label(value: string) {
		this.labelDiv.textContent = value;
	}

	set distanceFromSelf(value: number) {
		this.prevDistance = this.distance;
		this.distance = value;

		this.labelDiv.style.opacity = `${100 - (this.distance * 3)}%`;
	}

	get distanceFromSelf() {
		return this.distance;
	}

	delete() {
		console.log('avatar delete!', this.connection.identity?.name);
		this.mesh.removeFromParent();
		this.labelDiv.remove();
	}
}
