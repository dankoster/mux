
import { createMemo, createSignal, For, onCleanup, onMount } from "solid-js";
import "./VideoCall.css"
import * as server from "./data/data"
import { uiLog } from "./uiLog";
import { displayName, shortId } from "./helpers";
import { PeerConnection } from "./PeerConnection";
import { onVisibilityChange } from "./onVisibilityChange";
import { trace } from "./trace";

export let localStream: MediaStream

server.onWebRtcMessage((message) => {
	if (!peersById.has(message.senderId)) {
		ConnectVideo(message.senderId, false)
	}

	peersById.get(message.senderId)?.handleMessage(JSON.parse(message.message))
})


//both sides need to call this funciton
// the callee is polite, the caller is not
export function ConnectVideo(conId: string, polite: boolean = true) {
	console.log('ConnectVideo', conId, { polite })

	if (!localStream) throw new Error('local stream not ready')
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
	peerAdded(conId)
	peer.startCall(localStream)
}

export function DisconnectVideo(conId: string) {
	const peer = peersById.get(conId)

	if (!peer) {
		console.warn(`DisconnectVideo: conId already gone! ${conId}`)
		return
	}

	console.log('DisconnectVideo', conId)
	peer.endCall()
	peersById.delete(conId)
	peerRemoved(conId)
}

async function startLocalVideo() {
	localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

	if (localVideo) {
		localVideo.srcObject = localStream;
		localVideo.muted = true;
	}
}

async function stopLocalVideo() {
	localStream?.getTracks().forEach(track => track.stop())
	peersById?.forEach(peer => peer.holdCall())
}

export type TrackKind = 'audio' | 'video'
export async function enableLocal(kind: TrackKind, enable: boolean) {
	localStream.getTracks().forEach(track => {
		if(track.kind === kind)
			track.enabled = enable
	})
}

let peerAdded: (conId: string) => void
let peerRemoved: (conId: string) => void
let localVideo: HTMLVideoElement

const peersById = new Map<string, PeerConnection>()

export default function VideoCall() {
	let videoContainer: HTMLDivElement
	let localVideoContainer: HTMLDivElement
	let popover: HTMLDivElement
	let observer: MutationObserver

	const [peers, setPeers] = createSignal<PeerConnection[]>()

	peerAdded = (conId: string) => {
		// uiLog(`peerAdded ${conId}`)
		setPeers(Array.from(peersById.values()))
	}

	peerRemoved = (conId: string) => {
		// uiLog(`peerRemoved ${conId}`)
		setPeers(Array.from(peersById.values()))
	}

	const popoverClick = () => {
		console.log('popoverClick')
		startLocalVideo()
		popover.hidePopover()
	}

	onMount(async () => {
		startLocalVideo()

		// onVisibilityChange(visible => {
		// 	trace('visible', visible)
		// 	if (!visible) {
		// 		//say 'welcome back' in popover
		// 		// click anywhere to start video
		// 		// stopLocalVideo()
		// 		// popover.showPopover()
		// 	}
		// });


		//handle style changes when videos are added and removed
		observer = new MutationObserver(() =>
			localVideoContainer?.classList.toggle('alone', videoContainer.children.length <= 2))
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

	const handleMuteEvent = (track: MediaStreamTrack) => {
		if(track.kind == 'video') {
			videoElement.srcObject = track.muted ? null : props.peer.remoteStream
		}
		videoElement.classList.toggle(`${track.kind}-muted`, track.muted)
	}

	const [name, setName] = createSignal('')

	onMount(() => {
		const con = server.connections.find(con => con.id === props.peer.conId)
		setName(displayName(con) || shortId(props.peer.conId))

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

	return <div class="video-ui peer">
		<video id={props.peer.conId} class="remote" ref={videoElement} autoplay playsinline />
		<span class="name">{name()}</span>
	</div>
}