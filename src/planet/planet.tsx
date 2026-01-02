import { createEffect, onCleanup, onMount } from 'solid-js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'

import { Connection } from '../../server/types'
import { displayName, shortId } from '../helpers'
import { makeSphere } from './makeSphere'
import { Avatar } from './avatar'
import { calculateThirdPersonCamera, placeCameraPastTargetFromPosition } from './thirdPersonCamera'

import * as Data from '../data/data'
import * as THREE from 'three'
import * as positionSocket from '../data/positionSocket'

import './planet.css'
import { resizeRendererToDisplaySize } from './resizeRenderer'
import { Area, AreaParams } from './area'
import { Intersections } from './Intersections'
import { uiLog } from '../uiLog'

function NotReady():any { throw new Error('<Planet /> not ready!') }

export let addArea: (ap: AreaParams) => Area = () => NotReady()
export let removeArea: (id: string) => Area | undefined = () => NotReady()
export let becomeAnynomous: () => void = () => NotReady()
export let getSelfAvatarPosition: () => THREE.Vector3Like = () => NotReady()
 
export const intersections = new Intersections()

export function Planet() {

	let stopRendering = false
	let planetCanvas: HTMLCanvasElement
	let planetLabels: HTMLDivElement
	let scene: THREE.Scene
	let camera: THREE.PerspectiveCamera
	let sphere: THREE.Group<THREE.Object3DEventMap>
	let selfAvatar: Avatar
	const avatarsById = new Map<string, Avatar>()
	const areas: Area[] = []

	let sceneIsReady: (scene: THREE.Scene) => void
	const sceneReady = new Promise<THREE.Scene>(resolve => sceneIsReady = resolve)

	async function getAvatar(con: Connection): Promise<Avatar | undefined> {
		if(!con) console.warn(`cannot getAvatar for ${con}`) 
		
		await sceneReady

		if(!scene){
			console.warn('scene not ready!')
			return
		}

		let avatar = avatarsById.get(con.id)
		
		if (!avatar) {
			avatar = new Avatar()
			avatar.connection = con
			avatar.label.text = displayName(con) || shortId(con.id)
			if (con.position) {
				const position = new THREE.Vector3(con.position.x, con.position.y, con.position.z)
				avatar.setPositionAndLook(position, con.quaternion)
			}
			avatarsById.set(con.id, avatar)
		}
		
		if(scene && !scene.children.includes(avatar.mesh)){
			scene.add(avatar.mesh)
		}
		
		return avatar
	}

	becomeAnynomous = () => {
		console.log(`planet.becomeAnonymous()`)
		selfAvatar.label.text = shortId(selfAvatar.connection?.id)
	}

	getSelfAvatarPosition = () => selfAvatar.mesh.position
	
	addArea = (params: AreaParams) => {
		const area = new Area(params)		
		area.setPositionAndLook({ position: params.position, lookTarget: sphere?.position })
		
		console.log('addArea', area)
		if(scene && !scene.children.includes(area.mesh)){
			scene.add(area.mesh)
			areas.push(area)
		}
		if(!scene)
			console.trace('scene not ready!', area)

		return area
	}

	removeArea = (id: string) => {
		const index = areas.findIndex(a => a.id === id)
		if(index >= 0) {
			const area = areas.splice(index,1)[0]
			area.delete()
			return area
		}
	}

	//add/remove avatars when connection status changes
	createEffect(async () => {
		for (const con of Data.connections) {
			if (con.status === 'online' && con.position && !avatarsById.has(con.id)) {
				await getAvatar(con)
			}

			//solid-js wierdness: if the following two conditionals are swapped
			// this effect does not fire. 
			if (con.status !== 'online' && avatarsById.has(con.id)) {
				const avatar = avatarsById.get(con.id)
				avatar?.delete()
				avatarsById.delete(con.id)
			}
		}
	})

	positionSocket.onGotPosition(async (message) => {
		const con = Data.connections.find(con => con.id === message.id)

		if (con?.status !== 'online') console.warn(`got position for ${con?.id} with status ${con?.status}`)
		
		//get the avatar for this position (add, if necessary)
		let avatar = await getAvatar(con)		
		const position = new THREE.Vector3(message.position.x, message.position.y, message.position.z)
		const quaternion = message.quaternion;
		avatar.setPositionAndLook(position, quaternion)
		updateDistanceFromSelf(avatar)
	})

	function updateDistanceFromSelf(avatar: Avatar, minDistanceMoved: number = 0.25) {
		if(avatar == selfAvatar) return
		
		avatar.distanceFromSelf = avatar.mesh.position.distanceTo(selfAvatar.mesh.position)

		if(avatar.distanceFromSelf > avatar.lastBroadcastDistanceFromSelf + minDistanceMoved
			|| avatar.distanceFromSelf < avatar.lastBroadcastDistanceFromSelf - minDistanceMoved
		) {
			avatar.lastBroadcastDistanceFromSelf = avatar.distanceFromSelf
		}
	}

	function broadcastPosition(avatar: Avatar, minDistanceMoved: number = 0.25) {
		if (!selfAvatar) return
		
		if (avatar?.mesh?.position.distanceTo(selfAvatar.lastBroadcastPosition) > minDistanceMoved) {
			const broadcasted = positionSocket.broadcastPosition(selfAvatar?.mesh?.position, selfAvatar?.mesh?.quaternion.toArray())
			if (broadcasted) {
				if (selfAvatar.lastBroadcastPosition) selfAvatar.lastBroadcastPosition.copy(selfAvatar?.mesh?.position)
				else selfAvatar.lastBroadcastPosition = selfAvatar.mesh.position
			}
		}
	}

	setInterval(() => {
		broadcastPosition(selfAvatar)
	}, 25)

	async function BuildSceneAndStartRendering() {
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas: planetCanvas })
		const labelRenderer = new CSS2DRenderer({ element: planetLabels })
		scene = new THREE.Scene()
		camera = new THREE.PerspectiveCamera(70, window.innerWidth / planetCanvas.offsetHeight, 0.01, 1000)
		camera.position.z = 60

		sphere = makeSphere(30, 0x156289)
		scene.add(sphere)

		const orbit = new OrbitControls(camera, renderer.domElement)
		orbit.enableZoom = false
		orbit.enablePan = false
		orbit.enableDamping = true
		orbit.dampingFactor = 0.04

		const lights: THREE.DirectionalLight[] = []
		lights[0] = new THREE.DirectionalLight(0xffffff, 3)
		lights[1] = new THREE.DirectionalLight(0xffffff, 3)
		lights[2] = new THREE.DirectionalLight(0xffffff, 3)
		lights[0].position.set(0, 200, 0)
		lights[1].position.set(100, 200, 100)
		lights[2].position.set(-100, -200, -100)
		for (const light of lights) {
			scene.add(light)
		}

		sceneIsReady(scene)
	
		let prevTime: number
		function render(time: number) {
			if (stopRendering) return

			const deltaTime = time - prevTime
			prevTime = time

			if (selfAvatar) {
				//move our avatar to be under the camera
				const c = calculateThirdPersonCamera({ deltaTime, target: sphere, camera })
				if(c?.currentPosition.distanceTo(c.idealPosition) > 0.01) {
					if (!selfAvatar?.mesh?.position) return

					selfAvatar.setPositionAndLook(c.currentPosition)

					//TODO: don't do this in then render thread!
					//our distance to all other avatars has now changed, so update them!
					avatarsById.forEach(avatar => updateDistanceFromSelf(avatar))
					areas.forEach(area => area.distanceFromSelf = selfAvatar.mesh.position.distanceTo(area.mesh.position))
				}
			}

			//move the camera around the scene origin
			orbit.update()

			//handle resize
			const resized = resizeRendererToDisplaySize({ renderer, labelRenderer })
			if (resized) {
				const canvas = renderer.domElement
				camera.aspect = canvas.clientWidth / canvas.clientHeight
				camera.updateProjectionMatrix()
			}

			//check for collisions
			areas.forEach(area => intersections.update(area, selfAvatar.interactable.intersects(area.interactable)))
			avatarsById.forEach((avatar) => {
				if(avatar != selfAvatar)
					intersections.update(avatar, selfAvatar?.interactable?.intersects(avatar.interactable))
			})

			renderer.render(scene, camera)
			labelRenderer.render(scene, camera)

			requestAnimationFrame(render)
		}
		requestAnimationFrame(render)
	}

	onMount(async () => {
		BuildSceneAndStartRendering()

		const con = await Data.selfConnection
		selfAvatar = await getAvatar(con)		
		placeCameraPastTargetFromPosition({ camera, target: selfAvatar?.mesh?.position, position: sphere.position })
	})
	
	onCleanup(() => {
		console.log(`planet cleanup`)
		stopRendering = true
	})

	return <div class="planet-container">
		<div class="labels" ref={planetLabels}></div>
		<canvas id="planet" class="planet" ref={planetCanvas}></canvas>
	</div>
}
