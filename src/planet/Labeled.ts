import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

type LabeledParams = {
	text?: string, 
	className?: string,
	labelClick?: (this: GlobalEventHandlers, ev: PointerEvent) => any
}
export class Labeled {
	labelDiv: HTMLDivElement

	constructor(mesh: THREE.Mesh, params?: LabeledParams) {
		this.labelDiv = document.createElement('div')
		this.labelDiv.className = params?.className ?? 'label'
		this.labelDiv.textContent = params?.text ?? ''
		this.labelDiv.onclick = params?.labelClick
		this.labelDiv.style.pointerEvents = params?.labelClick ? 'auto' : 'none';

		const label = new CSS2DObject(this.labelDiv)
		label.center.set(0.5, 2.5)
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
