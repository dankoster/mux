import { onCleanup, onMount } from 'solid-js';
import * as THREE from 'three';
import './planet.css'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'


function makeCube(size: number, color: number, x: number) {
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
		flatShading: true
	});

	const sphere = new THREE.Group();
	sphere.add(new THREE.LineSegments(sphereWireGeo, sphereLineMat));
	sphere.add(new THREE.Mesh(sphereGeo, meshMaterial));

	return sphere
}

export function Planet() {

	let planetCanvas: HTMLCanvasElement

	onMount(() => {
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas: planetCanvas });
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(70, window.innerWidth / planetCanvas.offsetHeight, 0.01, 1000);
		camera.position.z = 20;

		const cube = makeCube(0.2, 0x44aa88, 0)
		scene.add(cube);

		const sphere = makeSphere(8, 0x156289)
		scene.add(sphere);

		const orbit = new OrbitControls(camera, renderer.domElement);
		orbit.enableZoom = true;

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

		function render(time: number) {
			time *= 0.001;  // convert time to seconds

			cube.rotation.x = time;
			cube.rotation.y = time;
			sphere.rotation.y += 0.0005;

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
			const width = canvas.parentElement.clientWidth;
			const height = canvas.parentElement.clientHeight;
			const needResize = canvas.width !== width || canvas.height !== height;
			if (needResize) {
				console.log('setSize', width - canvas.width, height - canvas.height)
				renderer.setSize(width, height, false);
			}
			return needResize;
		}
	})

	return <canvas id="planet" class="planet" ref={planetCanvas}></canvas>
}