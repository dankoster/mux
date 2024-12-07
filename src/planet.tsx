import { onMount } from 'solid-js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import './planet.css'
import { broadcastPosition, onGotPosition } from './data/positionSocket';
import { getSelf } from './data/data';
import { Connection } from '../server/types';

function makeCube(size: number, color?: number, x: number = 0) {
	const material = color ? new THREE.MeshPhongMaterial({ color }) : new THREE.MeshNormalMaterial();
	const boxGeometry = new THREE.BoxGeometry(size, size, size);
	const cube = new THREE.Mesh(boxGeometry, material);
	cube.position.x = x;
	return cube;
}

function makeSphere(radius: number, color: number) {
	const sphereParams = {
		radius: radius,
		widthSegments: 36,
		heightSegments: 18,
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
		opacity: 0.5
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

export function Planet() {

	let planetCanvas: HTMLCanvasElement
	let self: Connection

	const avatars = new Map<string, THREE.Mesh>()

	onMount(() => {
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas: planetCanvas });
		const scene = new THREE.Scene();

		const camera = new THREE.PerspectiveCamera(70, window.innerWidth / planetCanvas.offsetHeight, 0.01, 1000);
		camera.position.z = 20;

		const cube = makeCube(1, 0x44aa88, 0)
		scene.add(cube);
		getSelf.then((con) => {
			avatars.set(con.id, cube)
			self = con
			console.log('--- set self avatar', con.id)
		})

		const sphere = makeSphere(8, 0x156289)
		scene.add(sphere);

		const orbit = new OrbitControls(camera, renderer.domElement);
		orbit.enableZoom = true;

		////tilt camera as we lose altitude above the sphere
		// orbit.addEventListener('change', (e) => {
		// 	const sphereRadius = 8
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
			let avatar: THREE.Mesh
			if (!avatars.has(message.id)) {
				avatar = makeCube(1)
				scene.add(avatar);
				avatars.set(message.id, avatar)
			}

			avatar = avatars.get(message.id)
			avatar.position.fromArray([
				message.position.x,
				message.position.y,
				message.position.z
			])
			avatar.lookAt(sphere.position)

			if (message.id === self.id) {
				//make camera move to the new avatar position from the server
				//calculate camera direction relative to avatar position and distance from sphere
				direction
					.subVectors(avatar.position, sphere.position)
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
				cube.position.copy(_currentPosition)
				cube.lookAt(_currentLookat)

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

			renderer.render(scene, camera);

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
			}
			return needResize;
		}
	})

	return <canvas id="planet" class="planet" ref={planetCanvas}></canvas>
}