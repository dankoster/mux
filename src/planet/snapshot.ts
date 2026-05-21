import * as THREE from 'three'
import { addLights } from './lighting';

//webgl limits us to 8 concurrent renering contexts! https://threejs.org/manual/#en/multiple-scenes
//so use a shared module level renderer here
const snapRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })

export async function RenderSnapshotToUrl(object: THREE.Group | THREE.Object3D) {

	if (!object) {
		console.warn(`cannot render snapshot for ${object}`)
		return
	}
	
	//build the scene
	const snapScene: THREE.Scene = new THREE.Scene
	snapScene.add(object)
	addLights(snapScene)
	
	const snapCamera = new THREE.PerspectiveCamera(50, 1)
	//TODO calculate the camera z so the entire object is in the frustum
	snapCamera.position.z = 4
	snapCamera.updateProjectionMatrix();	
	
	//look at the center of the object
	const centerOfMesh = new THREE.Vector3();
	var boundingBox = new THREE.Box3()
	boundingBox.setFromObject(object);
	boundingBox.getCenter(centerOfMesh)
	snapCamera.lookAt(centerOfMesh)
	
	snapRenderer.setSize(300,300)
	snapRenderer.render(snapScene, snapCamera)

	return new Promise<string>((resolve, reject) => {
		try {
			//https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
			snapRenderer.domElement.toBlob((blob) => {
				if(!blob) throw new Error(`blob is ${blob}`)
				const url = URL.createObjectURL(blob);
				console.log(url)
				resolve(url)
			})
		} catch (ex) {
			reject(ex)
		}
	});
}