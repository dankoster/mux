import { Area, AreaParams } from "./area";
import { uiLog } from "../uiLog";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { Labeled } from "./Labeled";
import { Interactable } from "./Interactable";

import * as server from "../data/data";
import * as THREE from 'three'
import * as planet from "./planet";
import { shortId } from "../helpers";

export async function AddPalm(ap: AreaParams = {}) {

	if (!ap.ownerIdentityId) ap.ownerIdentityId = (await server.selfConnection).identity?.id
	if (!ap.uuid) ap.uuid = crypto.randomUUID()
	if (!ap.label) ap.label = shortId(ap.uuid)
	if (!ap.position) ap.position = planet.getSelfAvatar()?.mesh.position
	if (!ap.lookTarget) ap.lookTarget = planet.position()

	//TODO: deleting should be a complication
	// const labelClick = async () => {
	// 	const result = await server.removeArea(area.uuid)
	// 	if (!result.ok) {
	// 		uiLog(`Can't delete! This belongs to ${ap.ownerName}.`)
	// 		console.log(area)
	// 		return
	// 	}
	// 	// area.delete()
	// 	planet.removeArea(area.uuid)
	// }

	const loader = new GLTFLoader();
	loader.loadAsync('glb/palm.glb')
		.then(async gltf => {
			const area = new Area(ap)
			area.complications.push(new Interactable(area.mesh, 1, false))
			// area.complications.push(new Labeled(area.mesh, { text: `${ap.label} ${ap.ownerName}`, labelClick }))

			area.setPositionAndLook({ position: ap.position, lookTarget: ap.lookTarget })
			area.model = gltf
			var modelMesh = new THREE.Mesh()
			modelMesh.rotateOnAxis(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(-90))
			modelMesh.scale.setScalar(2)
			modelMesh.add(area.model.scene.clone())
			area.mesh.add(modelMesh)

			//optimistically add area locally before sending to server
			planet.addArea(area)

			if (ap.fromServer) return

			delete ap.lookTarget
			const result = await server.addArea(ap)
			if (!result.ok) {
				planet.removeArea(area.uuid)
				uiLog(`${result.status} error sending area to server`)
			}
		})
		.catch(error => console.error(error))
}