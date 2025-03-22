import { createEffect, onMount } from 'solid-js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'

import { connections, getSelf } from '../data/data'
import { Connection } from '../../server/types'
import { displayName, shortId } from '../helpers'
import { makeSphere } from './makeSphere'
import { Avatar, AvatarEvents } from './avatar'
import { calculateThirdPersonCamera, placeCameraPastTargetFromPosition } from './thirdPersonCamera'

import * as THREE from 'three'
import * as positionSocket from '../data/positionSocket'

import './planet.css'
import { resizeRendererToDisplaySize } from './resizeRenderer'


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
			avatar.addEventListener(AvatarEvents.AvatarPositionChanged, () => {
				if (avatar !== selfAvatar)
					avatar.distanceFromSelf = avatar.mesh.position.distanceTo(selfAvatar?.mesh?.position)
			})
			avatarsById.set(con.id, avatar)
		}
		
		if(scene && !scene.children.includes(avatar.mesh)){
			scene.add(avatar.mesh)
		}
		
		if(!scene)
			console.trace('scene not ready!', avatar)
		
		return avatar
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

		//add avatar for this position
		let avatar = getAvatar(con)
		avatar.setPositionAndLook({
			position: message.position,
			lookTarget: sphere?.position
		})

		//calculate distance from self
		if (selfAvatar && avatar != selfAvatar && !avatar.distanceFromSelf)
			avatar.distanceFromSelf = avatar.mesh.position.distanceTo(selfAvatar.mesh.position)
	})

	let lastBroadcastPosition = new THREE.Vector3()
	function broadcastPosition(avatar: Avatar, minDistanceMoved: number = 0.25) {
		if (avatar?.mesh?.position.distanceTo(lastBroadcastPosition) > minDistanceMoved) {
			const broadcasted = positionSocket.broadcastPosition(selfAvatar?.mesh?.position)
			if (broadcasted)
				lastBroadcastPosition.copy(selfAvatar?.mesh?.position)
		}
	}

	setInterval(() => {
		broadcastPosition(selfAvatar)
	}, 25)

	function updateDistanceFromSelfToAllOtherAvatars() {
		avatarsById.forEach(avatar => {
			if (avatar == selfAvatar) return

			avatar.distanceFromSelf = avatar.mesh.position.distanceTo(selfAvatar.mesh.position)

			//TODO: debounce! Use same minDistanceMoved check as broadcastPosition
			distanceToAvatarChanged(avatar)
		})
	}

	function BuildSceneAndStartRendering() {
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas: planetCanvas })
		const labelRenderer = new CSS2DRenderer({ element: planetLabels })
		scene = new THREE.Scene()
		camera = new THREE.PerspectiveCamera(70, window.innerWidth / planetCanvas.offsetHeight, 0.01, 1000)
		camera.position.z = 60

		sphere = makeSphere(30, 0x156289)
		scene.add(sphere)

		const orbit = new OrbitControls(camera, renderer.domElement)
		orbit.enableZoom = true
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

			//move our avatar to be under the camera
			if (selfAvatar?.mesh?.position) {
				const thirdPersonCamera = calculateThirdPersonCamera({ deltaTime, target: sphere, camera })
				selfAvatar?.setPositionAndLook({
					position: thirdPersonCamera.currentPosition,
					lookTarget: thirdPersonCamera.currentLookat
				})
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


	onMount(() => {
		BuildSceneAndStartRendering()

		getSelf.then((con) => {
			selfAvatar = getAvatar(con)
			selfAvatar.addEventListener(AvatarEvents.AvatarPositionChanged, updateDistanceFromSelfToAllOtherAvatars)
			placeCameraPastTargetFromPosition({ camera, target: selfAvatar?.mesh?.position, position: sphere.position })
		})

	})

	return <div class="planet-container">
		<div class="labels" ref={planetLabels}></div>
		<canvas id="planet" class="planet" ref={planetCanvas}></canvas>
	</div>
}
