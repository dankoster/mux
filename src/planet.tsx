import { createEffect, onMount } from 'solid-js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import './planet.css'
import * as positionSocket from './data/positionSocket';
import { connections, getSelf } from './data/data';
import { Connection, Position } from '../server/types';
import { displayName, shortId } from './helpers';
import { degToRad } from 'three/src/math/MathUtils.js';
import { trace } from './trace';

function makeSphere(radius: number, color: number) {
	const sphereParams = {
		radius: radius,
		widthSegments: 72,
		heightSegments: 36,
		phiStart: 0,
		phiLength: Math.PI * 2,
		thetaStart: 0,
		thetaLength: Math.PI
	};
	const sphereGeo = new THREE.SphereGeometry(
		sphereParams.radius,
		sphereParams.widthSegments,
		sphereParams.heightSegments,
		sphereParams.phiStart,
		sphereParams.phiLength,
		sphereParams.thetaStart,
		sphereParams.thetaLength
	)
	const sphereWireGeo = new THREE.EdgesGeometry(sphereGeo);
	const sphereLineMat = new THREE.LineBasicMaterial({
		color: 0xffffff,
		transparent: true,
		opacity: 0.2
	});
	const meshMaterial = new THREE.MeshPhongMaterial({
		color,
		emissive: 0x072534,
		side: THREE.DoubleSide,
		flatShading: false //false = smooth, true = facets
	});

	const sphere = new THREE.Group();
	sphere.add(new THREE.LineSegments(sphereWireGeo, sphereLineMat));
	sphere.add(new THREE.Mesh(sphereGeo, meshMaterial));

	return sphere
}

export class Avatar {
	mesh: THREE.Mesh
	connection?: Connection
	_distance: number = 0
	prevDistance: number = 0
	private labelDiv: HTMLDivElement

	constructor(size: number, color?: number, x: number = 0) {
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

		this.labelDiv = labelDiv
		this.mesh = mesh
	}

	setPosition(pos: Position) {
		if (!pos) return
		this.mesh.position.fromArray([
			pos.x,
			pos.y,
			pos.z
		])
	}

	get label() {
		return this.labelDiv.textContent
	}
	set label(value: string) {
		this.labelDiv.textContent = value
	}

	set distance(value: number) {
		this.prevDistance = this._distance
		this._distance = value
		this.labelDiv.style.opacity = `${100 - (this._distance * 3)}%`
	}

	get distance() {
		return this._distance
	}

	delete() {
		console.log('avatar delete!', this.connection.identity?.name)
		this.mesh.removeFromParent()
		this.labelDiv.remove()
	}
}

export function Planet(props: { onDistanceChanged: (avatar: Avatar) => void }) {

	let planetCanvas: HTMLCanvasElement
	let planetLabels: HTMLDivElement
	let scene: THREE.Scene
	let camera: THREE.PerspectiveCamera
	let sphere: THREE.Group<THREE.Object3DEventMap>
	let selfAvatar: Avatar
	const tmpVec3 = new THREE.Vector3();
	const avatarsById = new Map<string, Avatar>()

	function GetAvatar(con: Connection): Avatar | undefined {
		if (!scene) {
			console.log('GetAvatar: scene not ready!')
			return undefined
		}

		if (!avatarsById.has(con.id)) {
			let avatar = new Avatar(1)
			avatar.connection = con
			avatar.label = displayName(con) || shortId(con.id)
			avatar.setPosition(con.position)
			scene.add(avatar.mesh)
			avatarsById.set(con.id, avatar)
			console.log('created avatar for', avatar.label)
		}

		return avatarsById.get(con.id)
	}

	function moveCameraToAvatar(avatar: Avatar) {
		if (!avatar?.mesh?.position?.length()) return //don't move the camera to {0,0,0}

		console.log('moveCameraToAvatar', avatar.mesh.position)

		//calculate camera direction relative to avatar position and distance from sphere
		tmpVec3.subVectors(avatar.mesh.position, sphere.position)
			.normalize()
			.multiplyScalar(camera.position.distanceTo(sphere.position));

		camera.position.copy(tmpVec3);
		camera.lookAt(sphere.position);
	}

	//remove avatars for connections that go offline
	createEffect(() => {
		for (const con of connections) {
			if (con.status === 'online' && con.position && !avatarsById.has(con.id))
				GetAvatar(con)

			//solid-js wierdness: if the following two conditionals are swapped
			// this effect does not fire. 
			if (con.status !== 'online' && avatarsById.has(con.id)) {
				const avatar = avatarsById.get(con.id)
				//const avatar = avatarsById.get(con.id)
				avatar?.delete()
				avatarsById.delete(con.id)
			}
		}
	})

	positionSocket.onGotPosition((message) => {
		const con = connections.find(con => con.id === message.id)
		if (con?.status !== 'online')
			return

		//add avatar for this position
		let avatar = GetAvatar(con)
		avatar?.setPosition(message.position)
		avatar?.mesh.lookAt(sphere?.position)

		//calculate distance from self
		if (selfAvatar && avatar != selfAvatar)
			avatar.distance = avatar.mesh.position.distanceTo(selfAvatar.mesh.position)
	})

	let lastBroadcastPosition = new THREE.Vector3()
	function broadcastPosition(avatar: Avatar, minDistanceMoved: number = 0.25) {
		if (avatar?.mesh?.position.distanceTo(lastBroadcastPosition) > minDistanceMoved) {
			const broadcasted = positionSocket.broadcastPosition(selfAvatar?.mesh?.position);
			if (broadcasted)
				lastBroadcastPosition.copy(selfAvatar?.mesh?.position);
		}
	}

	onMount(() => {
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas: planetCanvas })
		const labelRenderer = new CSS2DRenderer({ element: planetLabels })
		scene = new THREE.Scene()
		camera = new THREE.PerspectiveCamera(70, window.innerWidth / planetCanvas.offsetHeight, 0.01, 1000)
		camera.position.z = 60

		getSelf.then((con) => {
			selfAvatar = GetAvatar(con)
			moveCameraToAvatar(selfAvatar)
		})

		setInterval(() => {
			broadcastPosition(selfAvatar);
		}, 25);

		sphere = makeSphere(30, 0x156289)
		scene.add(sphere)

		const orbit = new OrbitControls(camera, renderer.domElement)
		orbit.enableZoom = true
		orbit.enableDamping = true
		orbit.dampingFactor = 0.04

		//calculate distance to every other avatar
		orbit.addEventListener('change', (e) => {
			avatarsById.forEach(avatar => {
				if (avatar == selfAvatar) return

				avatar.distance = avatar.mesh.position.distanceTo(selfAvatar.mesh.position)
				props.onDistanceChanged(avatar)
			})
		})


		// //tilt camera as we lose altitude above the sphere
		// orbit.addEventListener('change', (e) => {
		// 	const sphereRadius = 30
		// 	const distanceToSphere = camera.position.distanceTo(sphere.position) - sphereRadius
		// 	console.log('orbit change', distanceToSphere, camera.rotation)

		// 	const rad = degToRad(45 -  3 * distanceToSphere)
		// 	camera.rotateX(rad)

		// })

		const lights = []
		lights[0] = new THREE.DirectionalLight(0xffffff, 3)
		lights[1] = new THREE.DirectionalLight(0xffffff, 3)
		lights[2] = new THREE.DirectionalLight(0xffffff, 3)

		lights[0].position.set(0, 200, 0)
		lights[1].position.set(100, 200, 100)
		lights[2].position.set(- 100, - 200, - 100)

		for (const light of lights) {
			scene.add(light)
		}


		const raycaster = new THREE.Raycaster();


		let prevTime: number

		function render(time: number) {
			const deltaTime = time - prevTime
			prevTime = time;

			//move our avatar to be under the camera
			if (selfAvatar?.mesh?.position) {
				const thirdPersonCamera = calculateThirdPersonCamera(deltaTime, sphere);
				selfAvatar?.mesh?.position.copy(thirdPersonCamera.currentPosition);
				selfAvatar?.mesh?.lookAt(thirdPersonCamera.currentLookat);
			}

			//move the camera around the scene origin
			orbit.update()

			//handle resize
			const resized = resizeRendererToDisplaySize()
			if (resized) {
				const canvas = renderer.domElement
				camera.aspect = canvas.clientWidth / canvas.clientHeight
				camera.updateProjectionMatrix()
			}

			renderer.render(scene, camera)
			labelRenderer.render(scene, camera)

			requestAnimationFrame(render)
		}
		requestAnimationFrame(render)

		let _currentPosition: THREE.Vector3
		let _currentLookat: THREE.Vector3
		function calculateThirdPersonCamera(deltaTime: number, target: THREE.Group) {
			const _elapsedSec = deltaTime * 0.001; // convert time to seconds

			//direction vector from camera to sphere
			tmpVec3.subVectors(target.position, camera.position).normalize();

			//find intersection point(s) on surface of sphere
			raycaster.set(camera.position, tmpVec3);
			const intersections = raycaster.intersectObject(target);

			//find intersection with the surface of the sphere
			//@ts-expect-error Property 'geometry' does not exist on type 'Object3D<Object3DEventMap>'.
			const firstIntersectedSphereGeometry = intersections?.find(i => i.object?.geometry?.type === 'SphereGeometry');
			if (firstIntersectedSphereGeometry) {

				//move away from the sphere origin by ... half a normal vector?
				// TODO: this should place the position on the surface of the target object
				const idealPosition = firstIntersectedSphereGeometry?.point
					.addScaledVector(firstIntersectedSphereGeometry.normal, 0.5); 
				const idealLookat = firstIntersectedSphereGeometry.normal;

				const t = 1.0 - Math.pow(0.001, _elapsedSec);
				if (_currentPosition && _currentLookat) {
					_currentPosition?.lerp(idealPosition, t);
					_currentLookat?.lerp(idealLookat, t);
				}
				else {
					_currentPosition = idealPosition;
					_currentLookat = idealLookat;
				}

				return {
					currentPosition: _currentPosition,
					currentLookat: _currentLookat,
					idealPosition,
					idealLookat
				}
			}
		}

		function resizeRendererToDisplaySize() {
			const canvas = renderer.domElement
			const width = canvas.parentElement?.clientWidth
			const height = canvas.parentElement?.clientHeight

			if (!width || !height)
				return false

			const needResize = canvas.width !== width || canvas.height !== height
			if (needResize) {
				renderer.setSize(width, height)
				labelRenderer.setSize(width, height)
			}
			return needResize
		}
	})

	return <div class="planet-container">
		<div class="labels" ref={planetLabels}></div>
		<canvas id="planet" class="planet" ref={planetCanvas}></canvas>
	</div>
}
