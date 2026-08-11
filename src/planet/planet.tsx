import { createEffect, onCleanup, onMount } from 'solid-js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'

import { Connection } from '../../server/types'
import { displayName, shortId } from '../helpers'
import { makeSphere } from './makeSphere'
import { Avatar } from './entity/avatar'
import { calculateThirdPersonCamera, placeCameraPastTargetFromPosition } from './thirdPersonCamera'

import * as Data from '../data/data'
import * as THREE from 'three'
import * as positionSocket from '../data/positionSocket'

import './planet.css'
import { resizeRendererToDisplaySize } from './resizeRenderer'
import { Area, AreaParams } from './entity/area'
import { Intersections } from './Intersections'
import { Interactable } from './Interactable'
import { AddPalm } from './entity/palm'
import { AreaRecord } from '../../server/data/table/area'
import { addLights } from './lighting'
import { onVisibilityChange } from '../onVisibilityChange'
import { uiLog } from '../uiLog'
import { GetSettingValue, OnSettingChanged } from '../Settings'

function NotReady(): any { throw new Error('<Planet /> not ready!') }

export let addArea: (area: Area) => Area = () => NotReady()
export let removeArea: (id: string) => Area | undefined = () => NotReady()
export let becomeAnynomous: () => void = () => NotReady()
export let getSelfAvatar: () => Avatar | undefined = () => NotReady()
export let zoom: (area: Area) => void = () => NotReady()
export let position: () => THREE.Vector3 = () => NotReady()
export let getAreaById: (id: string) => Area | undefined = () => NotReady()
export let getAvatarById: (id: string) => Avatar | undefined = () => NotReady()
export let getIntersections: () => Intersections = () => NotReady()


export function Planet() {

	let stopRendering = false
	let planetCanvas: HTMLCanvasElement | undefined
	let planetLabels: HTMLDivElement | undefined
	let scene: THREE.Scene
	let camera: THREE.PerspectiveCamera
	let sphere: THREE.Group<THREE.Object3DEventMap>
	let selfAvatar: Avatar | undefined
	const avatarsById = new Map<string, Avatar>()
	const areas: Area[] = []
	const intersections = new Intersections()

	getIntersections = () => intersections

	let sceneIsReady: (scene: THREE.Scene) => void
	const sceneReady = new Promise<THREE.Scene>(resolve => sceneIsReady = resolve)

	let targetZoom = 1
	let trargetRotateSpeed = 0.85

	position = (): THREE.Vector3 => sphere?.position
	getAreaById = (areaId: string) => areas.find(a => a.uuid == areaId)
	getAvatarById = (id: string) => avatarsById.get(`${id}`)

	zoom = (area: Area): void => {
		if (!camera) throw new Error("Camera not ready to zoom")

		targetZoom = area ? 2 : 1
		trargetRotateSpeed = area ? 0.35 : 0.85

		console.log('planet.zoom', camera.zoom)
	}

	async function getAvatar(con: Connection | undefined): Promise<Avatar | undefined> {
		if (!con) throw new Error(`cannot getAvatar for ${con}`)

		await sceneReady

		if (!scene) {
			console.warn('scene not ready!')
			return
		}

		let avatar = avatarsById.get(con.id)

		if (!avatar) {
			console.log('avatar create!', con.identity?.name ?? con.id);
			avatar = new Avatar(con)
			
			if (con.position) {
				const position = new THREE.Vector3(con.position.x, con.position.y, con.position.z)
				avatar.setPositionAndLook(position, con.quaternion)
			}
			avatarsById.set(con.id, avatar)
		}

		if (scene && !scene.children.includes(avatar.mesh)) {
			scene.add(avatar.mesh)
		}
		return avatar
	}

	becomeAnynomous = () => {
		if (!selfAvatar) throw new Error(`selfAvatar is ${selfAvatar}}`)
		console.log(`planet.becomeAnonymous()`)
		selfAvatar.label.text = shortId(selfAvatar.connection?.id) ?? 'unknown'
	}

	getSelfAvatar = () => selfAvatar


	addArea = (area: Area) => {
		if (!scene) console.warn('scene not ready!')
		if (!(area instanceof Area)) throw new Error('area must be instance of Area')

		if (!scene.children.includes(area.mesh)) {
			// console.log('addArea', area)
			scene.add(area.mesh)
			areas.push(area)
		}

		return area
	}

	removeArea = (id: string) => {
		const index = areas.findIndex(a => a.uuid === id)

		if (index < 0)
			throw new Error(`area id not found! ${id}`)

		const area = areas.splice(index, 1)[0]

		if (intersections.intersecting.has(area))
			intersections.update(area, false)

		area.delete()
		return area
	}

	//add/remove avatars when connection status changes
	createEffect(async () => {
		for (const con of Data.connections) {
			//console.log(con.id, con.status ?? "offline")
			if (con.status === 'online' && con.position && !avatarsById.has(con.id)) {
				getAvatar(con)
			}

			//solid-js wierdness: if the following two conditionals are swapped
			// this effect does not fire. 
			if (con.status !== 'online' && avatarsById.has(con.id)) {
				const avatar = avatarsById.get(con.id)
				avatar?.delete()
				avatarsById.delete(con.id)
				intersections.update(avatar, false)
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
		avatar?.setPositionAndLook(position, quaternion)
		if (avatar) updateDistanceFromSelf(avatar)
	})

	function updateDistanceFromSelf(avatar: Avatar, minDistanceMoved: number = 0.25) {
		if (avatar == selfAvatar) return
		if (!selfAvatar) return

		avatar.distanceFromSelf = avatar.mesh.position.distanceTo(selfAvatar.mesh.position)

		if (avatar.distanceFromSelf > avatar.lastBroadcastDistanceFromSelf + minDistanceMoved
			|| avatar.distanceFromSelf < avatar.lastBroadcastDistanceFromSelf - minDistanceMoved
		) {
			avatar.lastBroadcastDistanceFromSelf = avatar.distanceFromSelf
		}
	}

	// let lastBroadcastPositionID
	function broadcastPosition(avatar: Avatar, minDistanceMoved: number = 0.25) {
		if (!selfAvatar) return

		if (avatar?.mesh?.position.distanceTo(selfAvatar.lastBroadcastPosition) > minDistanceMoved) {
			const broadcasted = positionSocket.broadcastPosition(selfAvatar?.mesh?.position, selfAvatar?.mesh?.quaternion.toArray())
			if (broadcasted) {
				if (selfAvatar.lastBroadcastPosition) selfAvatar.lastBroadcastPosition.copy(selfAvatar?.mesh?.position)
				else selfAvatar.lastBroadcastPosition = selfAvatar.mesh.position

				// const latlon = LatLonFromVector3(selfAvatar.lastBroadcastPosition)
				// lastBroadcastPositionID = uiLog(`${latlon.lat.toPrecision(6)}, ${latlon.lon.toPrecision(6)}`, { logId: lastBroadcastPositionID })
			}
		}
	}

	setInterval(() => {
		if (selfAvatar)
			broadcastPosition(selfAvatar)
	}, 25)

	setInterval(() => {
		//update distances
		avatarsById.forEach(avatar => updateDistanceFromSelf(avatar))
		areas.filter(a => a.mesh).forEach(area => area.distanceFromSelf = selfAvatar?.mesh.position.distanceTo(area.mesh?.position))

		//check for collisions (but don't wait for the async to finish)
		checkForCollisions()
	}, 50)

	async function checkForCollisions() {
		if (!selfAvatar) return

		areas.filter(a => a.interactable)
			.forEach(async area => {
				intersections.update(area, selfAvatar?.interactable?.intersects(area.interactable))
			})

		avatarsById.forEach(async avatar => {
			if (selfAvatar && avatar != selfAvatar)
				intersections.update(avatar, selfAvatar.interactable?.intersects(avatar.interactable))
		})
	}

	async function BuildSceneAndStartRendering() {
		console.log('BuildSceneAndStartRendering')
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas: planetCanvas })
		const labelRenderer = new CSS2DRenderer({ element: planetLabels })
		scene = new THREE.Scene()
		camera = new THREE.PerspectiveCamera(70, window.innerWidth / (planetCanvas?.offsetHeight ?? window.innerHeight), 0.01, 1000)
		camera.position.z = 60

		sphere = makeSphere(30, 0x156289)
		scene.add(sphere)

		const orbit = new OrbitControls(camera, renderer.domElement)
		orbit.enablePan = false
		orbit.enableDamping = true
		orbit.dampingFactor = 0.04
		orbit.enableZoom = true
		orbit.minZoom = 30
		orbit.rotateSpeed = 0.75

		addLights(scene)

		sceneIsReady(scene)

		let targetFps = 5
		onVisibilityChange(visible => {
			const limitFps = GetSettingValue('Limit fps when focus is lost')
			targetFps = (visible || !limitFps) ? 60 : 5
			uiLog(visible ? 'focused' : 'focus lost', { logId: 998 })
		})
		
		let showFps = GetSettingValue('Show fps')
		OnSettingChanged('Show fps', value => showFps = value)

		let prevTime = 0
		async function render(time: number) {
			if (stopRendering) return

			const start = performance.now()

			//elapsed miliseconds since last render
			const deltaTime = time - prevTime
			prevTime = time

			if(showFps) {
				const fps = 1000 / deltaTime 
				uiLog(`${Math.round(fps)} fps`, { logId: 999, timeoutMs: 2 * deltaTime })
			}


			if (selfAvatar) {
				//move our avatar to be under the camera
				const c = calculateThirdPersonCamera({ deltaTime, target: sphere, camera })
				if (c.currentPosition.distanceTo(c.idealPosition) > 0.01) {

					if (!selfAvatar?.mesh?.position) {
						debugger
						return
					}

					selfAvatar.setPositionAndLook(c.currentPosition)
				}
			}

			//move the camera around the scene origin
			orbit.update(deltaTime)

			//handle zoom
			if (camera.zoom != targetZoom) {
				const diff = targetZoom - camera.zoom
				const isReallyClose = () =>
					(targetZoom > camera.zoom && diff < 0.01)
					|| (targetZoom < camera.zoom && diff > -0.01)

				camera.zoom = isReallyClose() ? targetZoom : (camera.zoom + diff / 15)
				camera.updateProjectionMatrix()
				// console.log(diff, camera.zoom)
			}

			if (orbit.rotateSpeed != trargetRotateSpeed) {
				orbit.rotateSpeed = trargetRotateSpeed
			}

			//handle resize
			const resized = resizeRendererToDisplaySize({ renderer, labelRenderer })
			if (resized) {
				const canvas = renderer.domElement
				camera.aspect = canvas.clientWidth / canvas.clientHeight
				camera.updateProjectionMatrix()
			}

			renderer.render(scene, camera)
			labelRenderer.render(scene, camera)

			//limit fps if we have excess time
			//60fps is 16.666ms per frame so we can say anything more than that should be awaited
			const frameLength = performance.now() - start
			const targetFrameLength = 1000 / targetFps
			const timeRemainingInFrame = targetFrameLength - frameLength
			if (timeRemainingInFrame > 20) { 
				await new Promise<void>(resolve => setTimeout(() => resolve(), timeRemainingInFrame))
			}

			requestAnimationFrame(render)
		}
		requestAnimationFrame(render)
	}

	onMount(async () => {
		console.log(`Planet.onMount`)

		BuildSceneAndStartRendering()
		Data.loadAreas().then(areas => {
			areas.forEach((a: AreaRecord) => {
				const ap: AreaParams = {
					label: a.label,
					uuid: a.uuid,
					ownerIdentityId: a.ownerIdentityId,
					position: a.position,
					ownerName: a.ownerName,
					ownerAvatarUrl: a.ownerAvatarUrl,
					fromServer: true
				}

				//TODO area types
				AddPalm(ap)
			})
			console.log(`loaded areas`, areas)
		})

		Data.selfConnection.then(async con => {
			console.log(`got self connection`)
			selfAvatar = await getAvatar(con)
			console.log(`got self avatar`)
			if (!selfAvatar) throw new Error(`selfAvatar is ${selfAvatar}`)
			placeCameraPastTargetFromPosition({ camera, target: selfAvatar?.mesh?.position, position: sphere.position })
		})

		console.log(`Planet.onMount - Done!`)
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
