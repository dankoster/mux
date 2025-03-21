import * as THREE from 'three';

//third person camera inspired by simondev
const raycaster = new THREE.Raycaster();
let _currentPosition: THREE.Vector3;
let _currentLookat: THREE.Vector3;
const tmpVec3 = new THREE.Vector3();

		// //tilt camera as we lose altitude above the sphere
		// orbit.addEventListener('change', (e) => {
		// 	const sphereRadius = 30
		// 	const distanceToSphere = camera.position.distanceTo(sphere.position) - sphereRadius
		// 	console.log('orbit change', distanceToSphere, camera.rotation)

		// 	const rad = degToRad(45 -  3 * distanceToSphere)
		// 	camera.rotateX(rad)

		// })



export function placeCameraPastTargetFromPosition({ target, camera, position }: { target: THREE.Vector3, camera: THREE.PerspectiveCamera, position: THREE.Vector3 }) {
	if (!target.length()) return //don't move the camera to {0,0,0}

	//calculate camera direction relative to avatar position and distance from position
	tmpVec3.subVectors(target, position)
		.normalize()
		.multiplyScalar(camera.position.distanceTo(position));

	camera.position.copy(tmpVec3);
	camera.lookAt(position);
}


export function calculateThirdPersonCamera({ deltaTime, target, camera }: { deltaTime: number; target: THREE.Group; camera: THREE.PerspectiveCamera; }) {
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
		const idealPosition = firstIntersectedSphereGeometry?.point.addScaledVector(firstIntersectedSphereGeometry.normal, 0.5);
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
		};
	}
}
