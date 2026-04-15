import * as THREE from 'three';
import { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { AreaRecord } from '../../server/data/table/area';
import { shortId } from '../helpers';
import { uiLog } from '../uiLog';
import { Labeled } from './Labeled';
import { Avatar } from './avatar';

export type AreaParams = AreaRecord & {
	lookTarget?: THREE.Vector3
	fromServer?: boolean
}

export interface Complication {
	parent: Area
}

export class Area {
	mesh: THREE.Mesh
	model: GLTF
	uuid: string
	complications: any[] = []
	lookTarget?: THREE.Vector3
	params: AreaParams

	constructor(params: AreaParams) {
		this.uuid = params.uuid ?? crypto.randomUUID()
		this.params = params
		
		// const material = params.color ? new THREE.MeshPhongMaterial({ color:params.color }) : new THREE.MeshNormalMaterial();
		// const boxGeometry = new THREE.BoxGeometry(params.size, params.size, params.size);
		// this.mesh = new THREE.Mesh(boxGeometry, material);
		this.mesh = new THREE.Mesh();
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

	set distanceFromSelf(value: number) {
		this.complications
			.filter(c => c instanceof Labeled)
			.forEach(c => c.labelDiv.style.opacity = `${100 - (value * 3)}%`)
	}

	delete() {
		this.mesh.removeFromParent();
		this.complications.filter(c => c instanceof Labeled).forEach(l => l.labelDiv.remove())
	}

	private onAvatarMoved = () => {
		this.setPositionAndLook({
			position: this.holder.mesh.position,
			lookTarget: this.lookTarget
		})

		//tell the server we moved it!
	}

	holder: Avatar;

	//TODO: make grabbing a complication
	grab = (avatar: Avatar) => {
		if (this.holder) throw new Error(`already grabbed by ${this.holder.label.text}!`)
		
		this.holder = avatar
		this.holder.addEventListener(this.holder.event.moved, this.onAvatarMoved)
		uiLog(`${this.holder.label.text} grabbed ${shortId(this.uuid)}`)
	}
	
	release = (avatar?: Avatar) => {
		if (!this.holder) throw new Error(`${shortId(this.uuid)} is not held by anyone!`)
		if (avatar && avatar.connection?.id !== this.holder.connection?.id)
			throw new Error(`${avatar.connection.id} cannot release area ${shortId(this.uuid)}`)
			
		uiLog(`${this.holder.label.text} released ${shortId(this.uuid)}`)
		this.holder.removeEventListener(this.holder.event.moved, this.onAvatarMoved)
		this.holder = null
	}
}
