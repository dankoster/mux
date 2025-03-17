import * as THREE from 'three';

export function makeSphere(radius: number, color: number) {
	const sphereParams = {
		radius: radius,
		widthSegments: 72,
		heightSegments: 36,
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
	);
	const sphereWireGeo = new THREE.EdgesGeometry(sphereGeo);
	const sphereLineMat = new THREE.LineBasicMaterial({
		color: 0xffffff,
		transparent: true,
		opacity: 0.2
	});
	const meshMaterial = new THREE.MeshPhongMaterial({
		color,
		emissive: 0x072534,
		side: THREE.DoubleSide,
		flatShading: false //false = smooth, true = facets
	});

	const sphere = new THREE.Group();
	sphere.add(new THREE.LineSegments(sphereWireGeo, sphereLineMat));
	sphere.add(new THREE.Mesh(sphereGeo, meshMaterial));

	return sphere;
}
