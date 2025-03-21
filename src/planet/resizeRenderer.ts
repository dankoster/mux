import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export function resizeRendererToDisplaySize({ renderer, labelRenderer }: { renderer: THREE.WebGLRenderer; labelRenderer: CSS2DRenderer; }) {
	const width = renderer.domElement.parentElement?.clientWidth;
	const height = renderer.domElement.parentElement?.clientHeight;

	if (!width || !height)
		return false;

	const needResize = renderer.domElement.width !== width || renderer.domElement.height !== height;
	if (needResize) {
		renderer.setSize(width, height);
		labelRenderer.setSize(width, height);
	}
	return needResize;
}
