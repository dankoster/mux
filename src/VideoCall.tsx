
import { createMemo, createSignal, For, onCleanup, onMount } from "solid-js";
import "./VideoCall.css"
import * as server from "./data/data"
import { displayName, shortId } from "./helpers";
import { PeerConnection } from "./PeerConnection";



const peersById = new Map<string, PeerConnection>()
let localStream: MediaStream
const [micEnabled, setMicEnabled] = createSignal(false)
const [camEnabled, setCamEnabled] = createSignal(false)
const [screenEnabled, setScreenEnabled] = createSignal(false)

export {
	micEnabled,
	camEnabled,
	screenEnabled
}

export const toggleMic = () => {
	const enabled = !micEnabled()
	try {
		localStream.getAudioTracks().forEach(track => track.enabled = enabled)
		setMicEnabled(enabled)
	} catch (error) {
		if (error.name === 'TypeError' && error.message.startsWith('Cannot read properties of undefined')) {
			console.log('no local stream')
		}
		else throw error
	}
}
export const toggleVideo = () => {
	const enabled = !camEnabled()
	try {
		localStream.getVideoTracks().forEach(track => track.enabled = enabled)
		setCamEnabled(enabled)
	} catch (error) {
		if (error.name === 'TypeError' && error.message.startsWith('Cannot read properties of undefined')) {
			console.log('no local stream')
		}
		else throw error
	}
}
export const toggleScreenShare = () => {
	const enabled = !screenEnabled()
	setScreenEnabled(enabled)

	if (enabled) {
		//TODO: add video element
		const options = { audio: true, video: true };
		navigator.mediaDevices.getDisplayMedia(options).then(
			stream => {
				console.log('toggleScreenShare', stream)
				//share stream with peer connection
				peersById.forEach(peer => peer.addTracks(stream))

				//TODO: display stream preview thumbnail?
			},
			error => console.error(error)
		)
	}
}

export let ConnectVideo = (conId: string, polite: boolean = true): void => {
	throw new Error('VideoCall not ready')
}
export let DisconnectVideo = (conId: string): void => {
	throw new Error('VideoCall not ready')
}

export default function VideoCall() {
	let videoContainer: HTMLDivElement
	let localVideoContainer: HTMLDivElement
	let popover: HTMLDivElement
	let observer: MutationObserver
	let localVideo: HTMLVideoElement

	const [peers, setPeers] = createSignal<PeerConnection[]>()

	//both sides need to call this funciton
	// the callee is polite, the caller is not
	ConnectVideo = async (conId: string, polite: boolean = true) => {
		console.log('ConnectVideo', conId, { polite })

		if (peersById.has(conId)) {
			console.warn(`Peer already conneced! ${conId}`)
			return //already connected?
		}

		const peer = new PeerConnection({
			conId,
			polite,
			onDisconnect: () => DisconnectVideo(conId)
		})

		peersById.set(conId, peer)

		if (!localStream) {
			// popover.showPopover()
			await startLocalVideo()
		}

		peer.addTracks(localStream)

		setPeers(Array.from(peersById.values()))
	}

	DisconnectVideo = (conId: string) => {
		const peer = peersById.get(conId)

		if (!peer) {
			console.warn(`DisconnectVideo: conId already gone! ${conId}`)
			return
		}

		console.log('DisconnectVideo', conId)
		peer.endCall()
		peersById.delete(conId)

		// if(peers.length === 0) {
		// 	localStream.getTracks().forEach(track => {
		// 		track.stop()
		// 		localStream.removeTrack(track)
		// 	})

		// 	localVideo.srcObject = undefined
		// 	localStream = undefined
		// 	setCamEnabled(false)
		// 	setMicEnabled(false)
		// }

		setPeers(Array.from(peersById.values()))
	}

	async function startLocalVideo() {
		localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

		localVideo.srcObject = localStream;
		localVideo.muted = true;

		setCamEnabled(true)
		setMicEnabled(true)
	}

	async function stopLocalVideo() {
		localStream?.getTracks().forEach(track => track.stop())
		peersById?.forEach(peer => peer.holdCall())
	}


	const popoverClick = () => {
		console.log('popoverClick')
		startLocalVideo()
		popover.hidePopover()
	}

	onMount(async () => {
		//startLocalVideo()

		server.onWebRtcMessage((message) => {
			console.log('onWebRtcMessage', message)
			if (!peersById.has(message.senderId)) {
				ConnectVideo(message.senderId, false)
			}

			peersById.get(message.senderId)?.handleMessage(JSON.parse(message.message))
		})


		// onVisibilityChange(visible => {
		// 	console.log('visible', visible)
		// 	//if (!visible) {
		// 		//say 'welcome back' in popover
		// 		// click anywhere to start video
		// 		// stopLocalVideo()
		// 		// popover.showPopover()
		// 	//}
		// });


		//handle style changes when videos are added and removed
		observer = new MutationObserver(() =>
			localVideoContainer?.classList.toggle('alone', videoContainer.children.length <= 2)
		)
		observer.observe(videoContainer, { childList: true })
	})

	onCleanup(() => {
		console.log('VideoCall CLEANUP')
		peersById.forEach(peer => peer.endCall())
		peersById.clear();
		observer?.disconnect()
	})

	const myName = createMemo(() => {
		const self = server.self()
		return displayName(self)
	})

	return <div id="videos-container" class="video-call" ref={videoContainer}>
		<div class="video-ui local alone" ref={localVideoContainer}>
			<video id="local-video" ref={localVideo} autoplay playsinline />
			<span class="name">{myName()}</span>
		</div>

		<div ref={popover} popover>
			Popover content
			<button onclick={popoverClick}>Enable Video</button>
		</div>

		<For each={peers()}>
			{(peer) => <PeerVideo peer={peer} />}
		</For>
	</div>
}

function PeerVideo(props: { peer: PeerConnection }) {
	let videoElement: HTMLVideoElement
	let containerElement: HTMLDivElement

	const handleMuteEvent = (track: MediaStreamTrack) => {
		videoElement.classList.toggle(`${track.kind}-muted`, track.muted)
	}

	const [name, setName] = createSignal('')

	onMount(() => {
		const con = server.connections.find(con => con.id === props.peer.conId)
		setName(displayName(con) || shortId(props.peer.conId))

		//TODO: generate a video element for each video stream. 
		// 

		console.log('mounted!', videoElement, props.peer.remoteStream)
		props.peer.remoteStream.addEventListener('addtrack', (ev) => console.log('PeerVideo.addTrack', ev))
		props.peer.remoteStream.addEventListener('removetrack', (ev) => console.log('PeerVideo.removetrack', ev))
		videoElement.srcObject = props.peer.remoteStream
		props.peer.onTrack = (track: MediaStreamTrack) => {
			console.log('PeerVideo.onTrack', track)
			track.addEventListener('mute', () => handleMuteEvent(track))
			track.addEventListener('unmute', () => handleMuteEvent(track))
			handleMuteEvent(track)
		}
	})

	return <div class="video-ui peer" ref={containerElement}>
		<video id={props.peer.conId} class="remote" ref={videoElement} autoplay playsinline />
		<span class="name">{name()}</span>
	</div>
}