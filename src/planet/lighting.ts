import * as THREE from 'three'

export function addLights(targetScene: THREE.Scene) {
	const lights: THREE.DirectionalLight[] = []
	lights[0] = new THREE.DirectionalLight(0xffffff, 3)
	lights[1] = new THREE.DirectionalLight(0xffffff, 3)
	lights[2] = new THREE.DirectionalLight(0xffffff, 3)
	lights[0].position.set(0, 200, 0)
	lights[1].position.set(100, 200, 100)
	lights[2].position.set(-100, -200, -100)
	for (const light of lights) {
		light.castShadow = false
		targetScene.add(light)
	}
}
