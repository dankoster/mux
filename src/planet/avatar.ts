import * as THREE from 'three'
import { Connection } from '../../server/types'
import { Labeled } from './Labeled'
import { Interactable } from './Interactable'
import { uiLog } from '../uiLog'

import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { selfConnection } from '../data/data'

export class Avatar extends EventTarget {
	mesh: THREE.Mesh
	connection?: Connection
	prevDistanceFromSelf: number = undefined
	prevDistanceLocation: THREE.Vector3 = undefined
	lastBroadcastPosition: THREE.Vector3 = new THREE.Vector3
	lastBroadcastDistanceFromSelf: number = 0

	prevPositions: THREE.Vector3[] = []
	markers: THREE.Mesh[] = []

	box: THREE.Mesh
	model: GLTF
	interactable: Interactable
	label: Labeled
	chatBubble: Labeled

	private _distanceFromSelf: number = 0

	constructor(size: number = 1, color?: number, x: number = 0) {
		super()
		this.mesh = new THREE.Mesh()
		this.mesh.position.x = x

		const material = color ? new THREE.MeshPhongMaterial({ color }) : new THREE.MeshNormalMaterial()
		// const boxGeometry = new THREE.BoxGeometry(size, size, size)
		// this.box = new THREE.Mesh(boxGeometry, material)
		// this.mesh.add(this.box)

		const coneGeometry = new THREE.ConeGeometry(3, 3, 3);
		const cone = new THREE.Mesh(coneGeometry, material);
		this.mesh.add(cone);

		this.interactable = new Interactable(this.mesh, size, false)
		this.label = new Labeled(this.mesh)

		// const material = color ? new THREE.MeshPhongMaterial({ color }) : new THREE.MeshNormalMaterial()
		// const boxGeometry = new THREE.BoxGeometry(size, size, size)
		// this.mesh.add(new THREE.Mesh(boxGeometry, material))

		// const loader = new GLTFLoader();
		// loader.loadAsync('glb/shiba.glb')
		// 	.then(gltf => {
		// 		this.model = gltf
		// 		this.model.scene.position.y -= 0.5
		// 		var modelMesh = new THREE.Mesh()
		// 		modelMesh.add(this.model.scene)
		// 		this.mesh.add(modelMesh)
		// 	})
		// 	.catch(error => uiLog(error))

		this.addSpotlight()
		// this.addGui()

		// const axesHelper = new THREE.AxesHelper(5);
		// this.mesh.add(axesHelper)
	}

	private addGui() {
		const gui = new GUI();
		const params = {
			x: 0,
			y: 0,
			z: 0,
		};
		const low = THREE.MathUtils.degToRad(-90)
		const high = THREE.MathUtils.degToRad(90)
		const x = new THREE.Vector3(1, 0, 0)
		const y = new THREE.Vector3(0, 1, 0)
		const z = new THREE.Vector3(0, 0, 1)
		gui.add(params, 'x', low, high).onChange((angle) => {
			this.mesh.quaternion.setFromAxisAngle(x, angle)
		})
		gui.add(params, 'y', low, high).onChange((angle) => {
			this.mesh.quaternion.setFromAxisAngle(y, angle)
		})
		gui.add(params, 'z', low, high).onChange((angle) => {
			this.mesh.quaternion.setFromAxisAngle(z, angle)
		})

		gui.open()
	}

	private addSpotlight() {
		//https://threejs.org/docs/index.html#SpotLight
		//https://threejs.org/examples/webgl_lights_spotlight.html
		const spotLight = new THREE.SpotLight(0xffffff);
		spotLight.position.set(0, 9, 0);
		spotLight.angle = 0.5;
		spotLight.penumbra = 0.35;
		spotLight.decay = 1;
		spotLight.distance = 15; //0 = unlimited
		spotLight.intensity = 40;

		spotLight.castShadow = true;
		spotLight.shadow.mapSize.width = 1024;
		spotLight.shadow.mapSize.height = 1024;
		spotLight.shadow.camera.near = 2;
		spotLight.shadow.camera.far = 15;
		spotLight.shadow.focus = 1;
		spotLight.shadow.bias = - .003;
		spotLight.shadow.intensity = 1;
		this.mesh.add(spotLight);

		// const lightHelper = new THREE.SpotLightHelper(spotLight);
		// lightHelper.visible = true;
		// this.mesh.add(lightHelper);

		// const shadowCameraHelper = new THREE.CameraHelper( spotLight.shadow.camera ); // colored lines
		// shadowCameraHelper.visible = true;
		// this.mesh.add( shadowCameraHelper );
	}

	showChatBubble() {
		uiLog('avatar.showChatBubble')

		if (!this.chatBubble)
			this.chatBubble = new Labeled(this.mesh, { className: 'chat-bubble' })

		this.chatBubble.pushText("hello")
	}

	addMarker(position: THREE.Vector3, minDistance: number = 0.5, maxMarkers: number = 40) {
		if (!this.mesh?.parent) return

		if(this.markers.some(m => m.position.distanceTo(position) < minDistance)) return

		const sphereGeometry = new THREE.SphereGeometry(0.2)
		const marker = new THREE.Mesh(sphereGeometry, new THREE.MeshNormalMaterial())
		marker.position.copy(position)
		this.mesh.parent.add(marker)
		this.markers.push(marker)

		this.markers.forEach(m => {
			const geodata = m.geometry.toJSON()
			const radius = geodata["radius"]
			if(radius){
				m.geometry.dispose()
				m.geometry = new THREE.SphereGeometry(radius * 0.96)
			}
		})

		while (this.markers.length > maxMarkers) {
			this.mesh.parent.remove(this.markers.shift())
		}
	}

	setPositionAndLook(position: THREE.Vector3, quaternion?: THREE.QuaternionTuple) {
		if (!position) {
			uiLog(`Tried to set position with ${position}`)
			console.warn(`Tried to set position with ${position}`, this)
			return
		}
	
		if (!this.mesh?.position?.equals(position)) {
			this.mesh.position.copy(position)
			this.addMarker(position)
		}
		
		if (Array.isArray(quaternion)) {
			this.mesh.quaternion.fromArray(quaternion)
			return //don't calculate a quaternion if we already have one (from the server, probably)
		}
		
		if (!this.prevPositions.length || position.distanceTo(this.prevPositions[this.prevPositions.length - 1]) > 0.1) {
			this.prevPositions.push(position.clone())
		}

		if (this.prevPositions.length > 2) {
			var quat = this.calcMeshQuaterionAlongPath()
			if(quat)
				this.mesh.quaternion.copy(quat)
		}
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

	async delete() {

		if(this.connection?.id === (await selfConnection).id)
			console.warn('deleting self avatar!')

		console.log('avatar delete!', this.connection.identity?.name ?? this.connection.id);
		this.mesh.removeFromParent();
		this.label.remove();
	}


	//https://garden.bradwoods.io/notes/javascript/three-js/animate-a-mesh-on-a-spheres-surface
	calcMeshQuaterionAlongPath() {

		if (!this.mesh?.parent) {
			console.warn(`calcMeshQuaterionAlongPath: this.mesh.parent is`, this.mesh.parent)
			debugger
			return
		}

		const spline = new THREE.CatmullRomCurve3(this.prevPositions)
		const sphereCenter = this.mesh.parent.position

		// Create a unit vector that points forward (along the direction of movement) using the tangent at time 't' along the spline.
		// We'll use this so the mesh's +Z points toward the target.
		// Making the mesh face fowards as it travels the spline.
		const endOfSpline = 1
		const forward = spline.getTangent(endOfSpline).normalize()
		// Create a unit vector from the center of the sphere to the mesh’s position.
		// A normal vector. Indicates which direction a surface is facing.
		// We'll use this so the mesh's +Y points away from the center of the sphere.
		// Making the mesh sit up-right on the surface of the sphere.
		const up = this.mesh.position.clone().sub(sphereCenter).normalize()
		// Calculate a vector to use for the mesh's +X by calculating a direction perpendicular to both up and forward.
		// Required for creating a rotation matrix.
		const right = new THREE.Vector3().crossVectors(up, forward).normalize()

		// Recompute forward to ensure orthogonality
		// Due to floating-point errors, the forward vector may be misaligned after calculating up and right.
		// This ensures the forward vector is perpendicular to both right and up.
		const correctedForward = new THREE.Vector3()
			.crossVectors(right, up)
			.normalize()

		const rotationMatrix = new THREE.Matrix4().makeBasis(
			right, // X axis
			up, // Y axis
			correctedForward // Z axis
		)

		// Convert rotationMatrix to quaternion
		return new THREE.Quaternion().setFromRotationMatrix(rotationMatrix)
	}
}
