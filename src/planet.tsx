import { createEffect, onMount } from 'solid-js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import './planet.css'
import { broadcastPosition, onGotPosition } from './data/positionSocket';
import { connections, getSelf } from './data/data';
import { Connection } from '../server/types';
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
	let self: Connection

	const avatarsById = new Map<string, Avatar>()

	//remove avatars for connections that go offline
	createEffect(() => {
		for(const con of connections) {
			//solid-js wierdness: if the following two conditionals are swapped
			// this effect does not fire. 
			if (con.status !== 'online' && avatarsById.has(con.id)) {
				const avatar = avatarsById.get(con.id)
				avatar?.delete()
				avatarsById.delete(con.id)
			}
		}
	})

	onMount(() => {
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas: planetCanvas });
		const scene = new THREE.Scene();

		const labelRenderer = new CSS2DRenderer();
		labelRenderer.setSize(window.innerWidth, window.innerHeight);
		labelRenderer.domElement.style.position = 'absolute';
		const rect = renderer.domElement.getBoundingClientRect()
		labelRenderer.domElement.style.top = rect && `${rect.top}px`
		labelRenderer.domElement.style.pointerEvents = "none";
		document.body.appendChild(labelRenderer.domElement);

		const camera = new THREE.PerspectiveCamera(70, window.innerWidth / planetCanvas.offsetHeight, 0.01, 1000);
		camera.position.z = 60;

		let selfAvatar: Avatar
		getSelf.then((con) => {
			selfAvatar = new Avatar(1, 0x44aa88, 0)
			selfAvatar.label = displayName(con)
			scene.add(selfAvatar.mesh);
			avatarsById.set(con.id, selfAvatar)
			self = con
		})

		const sphere = makeSphere(30, 0x156289)
		scene.add(sphere);

		const orbit = new OrbitControls(camera, renderer.domElement);
		orbit.enableZoom = true;
		orbit.enableDamping = true;
		orbit.dampingFactor = 0.04

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

		const lights = [];
		lights[0] = new THREE.DirectionalLight(0xffffff, 3);
		lights[1] = new THREE.DirectionalLight(0xffffff, 3);
		lights[2] = new THREE.DirectionalLight(0xffffff, 3);

		lights[0].position.set(0, 200, 0);
		lights[1].position.set(100, 200, 100);
		lights[2].position.set(- 100, - 200, - 100);

		for (const light of lights) {
			scene.add(light)
		}

		onGotPosition((message) => {
			let avatar: Avatar
			const con = connections.find(con => con.id === message.id)
			if (con.status !== 'online')
				return

			if (!avatarsById.has(message.id)) {
				const label = displayName(con)
				avatar = new Avatar(1)
				scene.add(avatar.mesh);
				avatar.connection = con
				avatar.label = label || shortId(message.id)
				avatarsById.set(message.id, avatar)
			}

			avatar = avatarsById.get(message.id)
			avatar.mesh.position.fromArray([
				message.position.x,
				message.position.y,
				message.position.z
			])
			avatar.mesh.lookAt(sphere.position)
			if (selfAvatar && avatar != selfAvatar)
				avatar.distance = avatar.mesh.position.distanceTo(selfAvatar.mesh.position)

			if (self && message.id === self.id) {
				//make camera move to the new avatar position from the server
				//calculate camera direction relative to avatar position and distance from sphere
				direction
					.subVectors(avatar.mesh.position, sphere.position)
					.normalize()
					.multiplyScalar(camera.position.distanceTo(sphere.position));

				camera.position.copy(direction)
				camera.lookAt(sphere.position)
			}
		})


		const raycaster = new THREE.Raycaster();
		var direction = new THREE.Vector3();

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
			direction.subVectors(sphere.position, camera.position).normalize();

			//find intersection point(s) on surface of sphere
			raycaster.set(camera.position, direction)
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
						const broadcasted = broadcastPosition(_currentPosition)
						if (broadcasted)
							_lastBroadcastPosition.copy(_currentPosition)
					}
				}
			}

			const resized = resizeRendererToDisplaySize()
			if (resized) {
				const canvas = renderer.domElement;
				camera.aspect = canvas.clientWidth / canvas.clientHeight;
				camera.updateProjectionMatrix();
			}

			orbit.update()

			renderer.render(scene, camera);
			labelRenderer.render(scene, camera);

			requestAnimationFrame(render);
		}
		requestAnimationFrame(render);

		function resizeRendererToDisplaySize() {
			const canvas = renderer.domElement;
			const width = canvas.parentElement?.clientWidth;
			const height = canvas.parentElement?.clientHeight;

			if (!width || !height)
				return false

			const needResize = canvas.width !== width || canvas.height !== height;
			if (needResize) {
				renderer.setSize(width, height, false);
				labelRenderer.setSize(width, height);
				const rect = renderer.domElement.getBoundingClientRect()
				labelRenderer.domElement.style.top = rect && `${rect.top}px`
			}
			return needResize;
		}
	})

	return <canvas id="planet" class="planet" ref={planetCanvas}></canvas>
}
