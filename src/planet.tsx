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

export function Planet(props: {
	onDistanceChanged: (avatar: Avatar) => void
}) {

	let planetCanvas: HTMLCanvasElement
	let planetLabels: HTMLDivElement
	let scene: THREE.Scene
	let camera: THREE.PerspectiveCamera
	let sphere: THREE.Group<THREE.Object3DEventMap>
	let selfAvatar: Avatar
	const cameraToSphere = new THREE.Vector3();
	const avatarsById = new Map<string, Avatar>()

	function GetAvatar(con: Connection) {
		if (!scene) return undefined

		if (!avatarsById.has(con.id)) {
			let avatar = new Avatar(1)
			avatar.connection = con
			avatar.label = displayName(con) || shortId(con.id)
			avatar.setPosition(con.position)
			avatar.mesh.lookAt(sphere.position)
			scene.add(avatar.mesh)
			avatarsById.set(con.id, avatar)
		}

		return avatarsById.get(con.id)
	}

	function moveCameraToAvatar(avatar: Avatar) {
		if (!avatar?.mesh?.position?.length()) return //don't move the camera to {0,0,0}

		//calculate camera direction relative to avatar position and distance from sphere
		cameraToSphere
			.subVectors(avatar.mesh.position, sphere.position)
			.normalize()
			.multiplyScalar(camera.position.distanceTo(sphere.position));

		camera.position.copy(cameraToSphere);
		camera.lookAt(sphere.position);
	}

	//remove avatars for connections that go offline
	createEffect(() => {
		for (const con of connections) {
			if (con.status === 'online' && con.position)
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
		if (con.status !== 'online')
			return

		//add avatar for this position
		let avatar = GetAvatar(con)
		avatar.setPosition(message.position)
		avatar.mesh.lookAt(sphere?.position)

		//calculate distance from self
		if (selfAvatar && avatar != selfAvatar)
			avatar.distance = avatar.mesh.position.distanceTo(selfAvatar.mesh.position)
	})

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

		let _currentPosition: THREE.Vector3
		let _currentLookat: THREE.Vector3
		let _prevTime: number
		let _elapsedTime: number
		let _elapsedSec: number

		let _lastBroadcastTime: number = 0
		let _lastBroadcastPosition = new THREE.Vector3()

		function render(time: number) {

			_elapsedTime = time - _prevTime
			_elapsedSec = _elapsedTime *= 0.001;  // convert time to seconds
			_prevTime = time

			//direction vector from camera to sphere
			cameraToSphere.subVectors(sphere.position, camera.position).normalize();

			//find intersection point(s) on surface of sphere
			raycaster.set(camera.position, cameraToSphere)
			const intersections = raycaster.intersectObject(sphere)

			//put the cube on the surface of the sphere
			//@ts-expect-error Property 'geometry' does not exist on type 'Object3D<Object3DEventMap>'.
			const firstIntersectedSphereGeometry = intersections?.find(i => i.object?.geometry?.type === 'SphereGeometry')
			if (firstIntersectedSphereGeometry) {

				const idealPosition = firstIntersectedSphereGeometry?.point
					.addScaledVector(firstIntersectedSphereGeometry.normal, 0.5) //move away from the sphere origin
				const idealLookat = firstIntersectedSphereGeometry.normal

				const t = 1.0 - Math.pow(0.001, _elapsedSec);
				if (_currentPosition && _currentLookat) {
					_currentPosition?.lerp(idealPosition, t);
					_currentLookat?.lerp(idealLookat, t);
				}
				else {
					_currentPosition = idealPosition
					_currentLookat = idealLookat
				}

				//set position
				selfAvatar?.mesh?.position.copy(_currentPosition)
				selfAvatar?.mesh?.lookAt(_currentLookat)

				//broadcast position
				if (time - _lastBroadcastTime > 25) {
					_lastBroadcastTime = time
					if (_currentPosition.distanceTo(_lastBroadcastPosition) > 0.25) {
						const broadcasted = positionSocket.broadcastPosition(_currentPosition)
						if (broadcasted)
							_lastBroadcastPosition.copy(_currentPosition)
					}
				}
			}

			const resized = resizeRendererToDisplaySize()
			if (resized) {
				const canvas = renderer.domElement
				camera.aspect = canvas.clientWidth / canvas.clientHeight
				camera.updateProjectionMatrix()
			}

			orbit.update()

			renderer.render(scene, camera)
			labelRenderer.render(scene, camera)

			requestAnimationFrame(render)
		}
		requestAnimationFrame(render)

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
