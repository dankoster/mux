import { onMount } from 'solid-js';
import * as THREE from 'three';
import './planet.css'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export function Planet() {

	let planetDiv: HTMLDivElement

	onMount(() => {



		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setSize(window.innerWidth, planetDiv.offsetHeight);
		renderer.setAnimationLoop(animate);
		planetDiv.appendChild(renderer.domElement);

		const scene = new THREE.Scene();

		const camera = new THREE.PerspectiveCamera(70, window.innerWidth / planetDiv.offsetHeight, 0.01, 1000);
		camera.position.z = 20;

		const boxGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
		const material = new THREE.MeshNormalMaterial();
		const cube = new THREE.Mesh(boxGeometry, material);
		scene.add(cube);

		const twoPi = Math.PI * 2;
		const sphere = {
			radius: 8,
			widthSegments: 32,
			heightSegments: 16,
			phiStart: 0,
			phiLength: twoPi,
			thetaStart: 0,
			thetaLength: Math.PI
		};
		const sphereGeo = new THREE.SphereGeometry(
			sphere.radius,
			sphere.widthSegments,
			sphere.heightSegments,
			sphere.phiStart,
			sphere.phiLength,
			sphere.thetaStart,
			sphere.thetaLength
		)
		const sphereWireGeo = new THREE.WireframeGeometry(sphereGeo);


		const group = new THREE.Group();

		// const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
		const meshMaterial = new THREE.MeshPhongMaterial({ color: 0x156289, emissive: 0x072534, side: THREE.DoubleSide, flatShading: true });

		// group.add(new THREE.LineSegments(sphereWireGeo, lineMaterial));
		group.add(new THREE.Mesh(sphereGeo, meshMaterial));
		scene.add(group);


		const orbit = new OrbitControls( camera, renderer.domElement );
		orbit.enableZoom = true;

		const lights = [];
		lights[0] = new THREE.DirectionalLight(0xffffff, 3);
		lights[1] = new THREE.DirectionalLight(0xffffff, 3);
		lights[2] = new THREE.DirectionalLight(0xffffff, 3);

		lights[0].position.set(0, 200, 0);
		lights[1].position.set(100, 200, 100);
		lights[2].position.set(- 100, - 200, - 100);

		scene.add(lights[0]);
		scene.add(lights[1]);
		scene.add(lights[2]);

		function animate(time) {
			// cube.rotation.x = time / 2000;
			// cube.rotation.y = time / 1000;

			group.rotation.x += 0.005;
			group.rotation.y += 0.005;


			renderer.render(scene, camera);
		}

		function updateSize() {
			const width = document.getElementsByTagName("html")[0].clientWidth
			const height = planetDiv.offsetHeight - 1
			camera.aspect = width / height
			camera.updateProjectionMatrix()
			renderer.setSize(width, height);
		}

		updateSize()

		window.addEventListener('resize', (e) => { updateSize() })
	})

	return <div class="planet" ref={planetDiv}>
	</div>
}