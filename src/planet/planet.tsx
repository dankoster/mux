import { createEffect, onMount } from 'solid-js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'

import { connections, selfConnection } from '../data/data'
import { Connection } from '../../server/types'
import { displayName, shortId } from '../helpers'
import { makeSphere } from './makeSphere'
import { Avatar } from './avatar'
import { calculateThirdPersonCamera, placeCameraPastTargetFromPosition } from './thirdPersonCamera'

import * as THREE from 'three'
import * as positionSocket from '../data/positionSocket'

import './planet.css'
import { resizeRendererToDisplaySize } from './resizeRenderer'
import { Area } from './area'

function NotReady() { throw new Error('<Planet /> not mounted') }

export let addArea: () => void = () => NotReady()
export let becomeAnynomous: () => void = () => NotReady()

const distanceChangedHandlers: DistanceChangedHandler[] = []
export type DistanceChangedHandler = (av: Avatar) => void
function distanceToAvatarChanged(av: Avatar) {
	distanceChangedHandlers.forEach(handler => handler(av))
}

export function onDistanceToAvatarChanged(handler: DistanceChangedHandler) {
	distanceChangedHandlers.push(handler)
}

export function Planet() {

	let planetCanvas: HTMLCanvasElement
	let planetLabels: HTMLDivElement
	let scene: THREE.Scene
	let camera: THREE.PerspectiveCamera
	let sphere: THREE.Group<THREE.Object3DEventMap>
	let selfAvatar: Avatar
	const avatarsById = new Map<string, Avatar>()

	function getAvatar(con: Connection): Avatar | undefined {
		let avatar = avatarsById.get(con.id)
		
		if (!avatar) {
			avatar = new Avatar(1)
			avatar.connection = con
			avatar.label = displayName(con) || shortId(con.id)
			avatar.setPositionAndLook({ position: con.position, lookTarget: sphere?.position })
			avatarsById.set(con.id, avatar)
		}
		
		if(scene && !scene.children.includes(avatar.mesh)){
			scene.add(avatar.mesh)
		}
		
		if(!scene)
			console.trace('scene not ready!', avatar)
		
		return avatar
	}

	becomeAnynomous = () => {
		console.log(`planet.becomeAnonymous()`)
		selfAvatar.label = shortId(selfAvatar.connection?.id)
	}
	
	addArea = () => {
		if(!selfAvatar) throw new Error("selfAvatar not ready!")
		const area = new Area({size: 2})
		area.setPositionAndLook({ position: selfAvatar.mesh.position, lookTarget: sphere?.position })
		
		console.log('addArea', area)
		if(scene && !scene.children.includes(area.mesh)){
			scene.add(area.mesh)
		}
		if(!scene)
			console.trace('scene not ready!', area)
	}

	//add/remove avatars when connection status changes
	createEffect(() => {
		for (const con of connections) {
			if (con.status === 'online' && con.position && !avatarsById.has(con.id))
				getAvatar(con)

			//solid-js wierdness: if the following two conditionals are swapped
			// this effect does not fire. 
			if (con.status !== 'online' && avatarsById.has(con.id)) {
				const avatar = avatarsById.get(con.id)
				avatar?.delete()
				avatarsById.delete(con.id)
			}
		}
	})

	positionSocket.onGotPosition((message) => {
		const con = connections.find(con => con.id === message.id)
		if (con?.status !== 'online')
			return
		
		//get the avatar for this position (add, if necessary)
		let avatar = getAvatar(con)		
		avatar.setPositionAndLook({
			position: message.position,
			lookTarget: sphere?.position
		})
		
		updateDistanceFromSelf(avatar)
	})

	function setSelfAvatarPosition(position: THREE.Vector3, lookTarget: THREE.Vector3) {
		if (!selfAvatar?.mesh?.position) return

		selfAvatar.setPositionAndLook({ position, lookTarget })

		//our distance to all other avatars has now changed, so update them!
		avatarsById.forEach(avatar => updateDistanceFromSelf(avatar))
	}

	function updateDistanceFromSelf(avatar: Avatar, minDistanceMoved: number = 0.25) {
		if(avatar == selfAvatar) return
		
		avatar.distanceFromSelf = avatar.mesh.position.distanceTo(selfAvatar.mesh.position)

		if(avatar.distanceFromSelf > avatar.lastBroadcastDistanceFromSelf + minDistanceMoved
			|| avatar.distanceFromSelf < avatar.lastBroadcastDistanceFromSelf - minDistanceMoved
		) {
			distanceToAvatarChanged(avatar)
			avatar.lastBroadcastDistanceFromSelf = avatar.distanceFromSelf
		}
	}

	function broadcastPosition(avatar: Avatar, minDistanceMoved: number = 0.25) {
		if (!selfAvatar) return
		
		if (avatar?.mesh?.position.distanceTo(selfAvatar.lastBroadcastPosition) > minDistanceMoved) {
			const broadcasted = positionSocket.broadcastPosition(selfAvatar?.mesh?.position)
			if (broadcasted) {
				if (selfAvatar.lastBroadcastPosition) selfAvatar.lastBroadcastPosition.copy(selfAvatar?.mesh?.position)
				else selfAvatar.lastBroadcastPosition = selfAvatar.mesh.position
			}
		}
	}

	setInterval(() => {
		broadcastPosition(selfAvatar)
	}, 25)

	function BuildSceneAndStartRendering() {
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
	
		let prevTime: number
		function render(time: number) {
			const deltaTime = time - prevTime
			prevTime = time

			if (selfAvatar) {
				//move our avatar to be under the camera
				const thirdPersonCamera = calculateThirdPersonCamera({ deltaTime, target: sphere, camera })
				setSelfAvatarPosition(thirdPersonCamera.currentPosition, thirdPersonCamera.currentLookat)
			} else {
				initSelfAvatar()
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

			renderer.render(scene, camera)
			labelRenderer.render(scene, camera)

			requestAnimationFrame(render)
		}
		requestAnimationFrame(render)
	}

	async function initSelfAvatar() {
		selfAvatar = getAvatar(await selfConnection)		
		placeCameraPastTargetFromPosition({ camera, target: selfAvatar?.mesh?.position, position: sphere.position })
	}

	onMount(() => {
		initSelfAvatar()
		BuildSceneAndStartRendering()
	})

	return <div class="planet-container">
		<div class="labels" ref={planetLabels}></div>
		<canvas id="planet" class="planet" ref={planetCanvas}></canvas>
	</div>
}
