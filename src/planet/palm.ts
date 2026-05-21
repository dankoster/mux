import { Area, AreaParams } from "./area";
import { uiLog } from "../uiLog";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { Labeled } from "./Labeled";
import { Interactable } from "./Interactable";

import * as server from "../data/data";
import * as THREE from 'three'
import * as planet from "./planet";
import { shortId } from "../helpers";
import { RenderSnapshotToUrl } from "./snapshot";
import { Deletable } from "./Deletable";

//load glb and snapshot once for the module and cache it in memory
const loader = new GLTFLoader()
const palmGltf = loader.loadAsync('glb/palm.glb')
let palmImgUrl: string | undefined
palmGltf.then(async gltf => palmImgUrl = await RenderSnapshotToUrl(gltf.scene))

export async function AddPalm(ap: AreaParams = {}) {

	if (!ap.ownerIdentityId) ap.ownerIdentityId = (await server.selfConnection).identity?.id
	if (!ap.uuid) ap.uuid = crypto.randomUUID()
	if (!ap.label) ap.label = shortId(ap.uuid)
	if (!ap.position) ap.position = planet.getSelfAvatar()?.mesh.position
	if (!ap.lookTarget) ap.lookTarget = planet.position()

	if (!ap.position) throw new Error(`position is ${ap.position}`)

	const area = new Area(ap)
	area.interactable = new Interactable(area.mesh)
	area.deletable = new Deletable(area)
	// area.labeled = new Labeled(area.mesh, { text: `${ap.label} ${ap.ownerName}` })

	area.setPositionAndLook({ position: ap.position, lookTarget: ap.lookTarget })
	var modelMesh = new THREE.Mesh()
	modelMesh.rotateOnAxis(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(-90))
	modelMesh.scale.setScalar(2)
	modelMesh.add((await palmGltf).scene.clone())
	area.mesh.add(modelMesh)

	area.ImageUrl = palmImgUrl

	//optimistically add area locally before sending to server
	planet.addArea(area)

	//did the server tell us to add this palm?
	if (ap.fromServer) return

	//we're addig this palm, so we need to tell the server
	delete ap.lookTarget
	const result = await server.addArea(ap)
	if (!result.ok) {
		planet.removeArea(area.uuid)
		uiLog(`${result.status} error sending area to server`)
	}
}