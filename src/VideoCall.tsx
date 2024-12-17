
import { createMemo, createSignal, For, onCleanup, onMount } from "solid-js";
import "./VideoCall.css"
import * as server from "./data/data"
import type { DM } from "../server/types"
import { onCallEvent, sendDm } from "./data/directMessages";
import { uiLog } from "./uiLog";
import { displayName, shortId } from "./helpers";
import { PeerConnection } from "./PeerConnection";

let localStream: MediaStream

type ConnectionCommand = 'start' | 'end'
export function SendVideoCallRequest(conId: string, message: ConnectionCommand) {
	const con = server.connections.find(c => c.id === conId)
	const self = server.self();
	const dm: DM = {
		toId: con.id,
		fromId: self.id,
		fromName: self.identity?.name,
		message,
		kind: "call"
	};
	sendDm(dm, con.publicKey);
}

const handleConnectionCommand: { [key in ConnectionCommand]: (conId: string) => void } = {
	start: (conId) => ConnectVideo(conId, true),
	end: (conId) => DisconnectVideo(conId)
}

onCallEvent(dm => {
	//messages are broadcast to all connections that share an identity
	// but we only want to handle call messages for us specifically
	if (dm.toId !== server.self()?.id) {
		//console.log('ignoring call message', dm)
		return
	}

	console.log('onCallEvent', dm)
	handleConnectionCommand[dm.message as ConnectionCommand](dm.fromId)
})

//both sides need to call this funciton
// the callee is polite, the caller is not
export function ConnectVideo(conId: string, polite: boolean = true) {
	console.log('ConnectVideo', conId)

	if (!localStream) throw new Error('local stream not ready')
	if (peersById.has(conId)) {
		console.warn(`Peer already conneced! ${conId}`)
		return //already connected?
	}

	//Caller should send a connection request to the callee
	//Calee does not need to send a connection request back
	if (!polite)
		SendVideoCallRequest(conId, 'start')

	const peer = new PeerConnection({
		conId,
		polite,
	})

	const abortController = server.onWebRtcMessage((message) => {
		//only handle messages from this peer
		if (message.senderId === conId) {
			const { description, candidate } = JSON.parse(message.message);
			peer.handleMessage({ description, candidate })
		}
	})

	//cleanup the onDM evnet handler when we're done
	peer.addAbortController(abortController)

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

	SendVideoCallRequest(conId, 'end')
}

let peerAdded: (conId: string) => void
let peerRemoved: (conId: string) => void

const peersById = new Map<string, PeerConnection>()

export default function VideoCall() {
	let videoContainer: HTMLDivElement
	let localVideo: HTMLVideoElement
	let localVideoContainer: HTMLDivElement
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

	async function startLocalVideo() {
		localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
		localVideo.srcObject = localStream;
		localVideo.muted = true;
	}

	onMount(async () => {

		//connect local video
		if (!document.hidden)
			await startLocalVideo()

		//pause while tab is not in view
		document.addEventListener("visibilitychange", async () => {
			if (document.hidden) {
				console.log('/// Hidden')
				localStream.getTracks().forEach(track => track.stop())
				peersById.forEach(peer => peer.holdCall())

			} else {
				console.log('/// Visible')
				startLocalVideo()
				peersById.forEach(peer => peer.resumeCall(localStream))
			}
		});

		//handle style changes when videos are added and removed
		observer = new MutationObserver(() =>
			localVideoContainer?.classList.toggle('alone', videoContainer.children.length === 1))
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

		<For each={peers()}>
			{(peer) => <PeerVideo peer={peer} />}
		</For>
	</div>
}

function PeerVideo(props: { peer: PeerConnection }) {
	let videoElement: HTMLVideoElement

	const handleMuteEvent = (track: MediaStreamTrack) => {
		videoElement.classList.toggle(`${track.kind}-muted`, track.muted)
	}

	const [name, setName] = createSignal('')

	onMount(() => {
		const con = server.connections.find(con => con.id === props.peer.conId)
		setName(displayName(con) || shortId(props.peer.conId))

		console.log('mounted!', videoElement, props.peer.remoteStream)
		props.peer.remoteStream.addEventListener('addtrack', (ev) => console.log('addTrack', ev))
		props.peer.remoteStream.addEventListener('removetrack', (ev) => console.log('removetrack', ev))
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