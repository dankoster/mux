import * as THREE from 'three'

export class Interactable {
	range: number = 3
	sphere: THREE.Sphere
	mesh: THREE.Mesh
	ringMesh: THREE.Mesh | undefined

	constructor(mesh: THREE.Mesh, size: number = 1, showRing: boolean = false) {
		var radius = size * this.range
		this.sphere = new THREE.Sphere(mesh.position, radius)
		this.mesh = mesh

		if (showRing) {
			this.addRing(radius)
		}
	}
	
	addRing = (radius: number, color?: THREE.ColorRepresentation) => {
		const ring = new THREE.RingGeometry(radius, radius + .06, 32)
		const ringMaterial = new THREE.MeshBasicMaterial({ color: color || 0xccc000, side: THREE.DoubleSide })
		this.ringMesh = new THREE.Mesh(ring, ringMaterial)
		this.mesh.add(this.ringMesh)
	}

	removeRing = () => {
		if(this.ringMesh)
			this.mesh.remove(this.ringMesh)
	}

	intersects = (interactable: Interactable | undefined) => interactable && this.sphere.intersectsSphere(interactable?.sphere)
}
