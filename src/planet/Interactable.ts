import * as THREE from 'three'

export class Interactable {
	range: number = 3
	sphere: THREE.Sphere

	constructor(mesh: THREE.Mesh, size: number, showRing: boolean = true) {
		var radius = size * this.range
		this.sphere = new THREE.Sphere(mesh.position, radius)

		if (showRing) {
			const ring = new THREE.RingGeometry(radius, radius + .02, 32)
			const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xccc000, side: THREE.DoubleSide })
			const ringMesh = new THREE.Mesh(ring, ringMaterial)
			mesh.add(ringMesh)
		}
	}

	intersects = (interactable: Interactable) => this.sphere.intersectsSphere(interactable.sphere)
}
