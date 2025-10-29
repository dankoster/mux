import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

export class Labeled {
	labelDiv: HTMLDivElement

	constructor(mesh: THREE.Mesh, text?: string) {
		this.labelDiv = document.createElement('div')
		this.labelDiv.className = 'label'
		this.labelDiv.textContent = text ?? ''
		this.labelDiv.style.backgroundColor = 'transparent'
		this.labelDiv.style.pointerEvents = 'none'
		const label = new CSS2DObject(this.labelDiv)
		label.center.set(0.5, 1.5)
		label.layers.set(0)
		mesh.add(label)
	}

	get text() {
		return this.labelDiv.textContent
	}
	set text(value: string) {
		this.labelDiv.textContent = value
	}

	set opacity(value: string) {
		this.labelDiv.style.opacity = value
	}

	remove = () => this.labelDiv.remove()
}
