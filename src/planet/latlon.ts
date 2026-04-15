import * as THREE from 'three'

function getRadius(sphere: THREE.Group) {
	if (!sphere?.isGroup) throw new Error(`${sphere} is not a THREE.Group!`)

	const sphereMesh: THREE.Mesh = sphere.children.find(c => c['geometry'].type == 'SphereGeometry') as THREE.Mesh
	const sphereGeo = sphereMesh.geometry as THREE.SphereGeometry
	return sphereGeo?.parameters?.radius
}

export function LatLonFromVector3(sphere: THREE.Group, position: THREE.Vector3): { lat: number, lon: number } {
	const radius = getRadius(sphere)
	const latRad = Math.acos(position.y / radius); //theta
	const lonRad = Math.atan(position.x / position.z); //phi

	const radToDeg = (rad: number) => rad / (Math.PI / 180)

	//NOTE: assumes sphere is at 0,0,0
	return {
		lat: (radToDeg(latRad) - 90) * -1,
		lon: radToDeg(lonRad)
	}
}

export function LatLonToVector3({
	latitude,
	longitude,
	sphere
}: {
	latitude: number,
	longitude: number,
	sphere: THREE.Group, 
}) {

	const radius = getRadius(sphere)
	const { sin, cos, PI } = Math;
	const phi = (90 - latitude) * (PI / 180);
	const theta = (longitude + 180) * (PI / 180);

	const x = -radius * sin(phi) * cos(theta);
	const y = radius * cos(phi);
	const z = radius * sin(phi) * sin(theta);

	return new THREE.Vector3(x, y, z).add(sphere.position);
}
