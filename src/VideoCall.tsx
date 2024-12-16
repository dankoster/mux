
import { createMemo, createSignal, For, onCleanup, onMount } from "solid-js";
import "./VideoCall.css"
import * as server from "./data/data"
import type { DM } from "../server/types"
import { onCallEvent, sendDm } from "./data/directMessages";
import { uiLog } from "./uiLog";
import { displayName, shortId } from "./helpers";

//TODO: get this from the TURN server for each client, obviously
const servers: RTCConfiguration = {
	iceServers: [
		{
			urls: [
				'stun:stun.relay.metered.ca:80',
				'stun:stun1.l.google.com:19302',
				'stun:stun2.l.google.com:19302'
			],
		},
		{
			urls: "turn:global.relay.metered.ca:80",
			username: "20cd52d0dc022700b2755c26",
			credential: "MNMabfdDEZeLlOFU",
		},
		{
			urls: "turn:global.relay.metered.ca:80?transport=tcp",
			username: "20cd52d0dc022700b2755c26",
			credential: "MNMabfdDEZeLlOFU",
		},
		{
			urls: "turn:global.relay.metered.ca:443",
			username: "20cd52d0dc022700b2755c26",
			credential: "MNMabfdDEZeLlOFU",
		},
		{
			urls: "turns:global.relay.metered.ca:443?transport=tcp",
			username: "20cd52d0dc022700b2755c26",
			credential: "MNMabfdDEZeLlOFU",
		},
	],
	iceCandidatePoolSize: 10,
};

type pcInit = {
	conId: string,
	polite: boolean,
	onTrack?: (track: MediaStreamTrack) => void
}

class PeerConnection {
	remoteStream = new MediaStream();
	abortControllers: AbortController[] = []
	localRTCRtpSenders: RTCRtpSender[] = []
	conId: string;

	pc: RTCPeerConnection

	polite = false;
	makingOffer = false;
	ignoreOffer = false;

	onTrack: (track: MediaStreamTrack) => void

	constructor({ conId, polite, onTrack }: pcInit) {

		this.conId = conId
		this.pc = new RTCPeerConnection(servers)
		this.onTrack = onTrack
		this.polite = polite

		// Pull tracks from remote stream, add to video stream
		this.pc.ontrack = (event) => {
			const track = event.track
			console.log(`got ${event.type}: ${track.muted ? "muted" : "un-muted"} ${track.kind} from peer connection`, track.label)
			//track.addEventListener('end', () => this.remoteStream.removeTrack(track))
			//track.addEventListener('mute', () => this.remoteStream.removeTrack(track))
			//track.addEventListener('unmute', () => this.remoteStream.addTrack(track))
			this.remoteStream.addTrack(track);
			this.logTrackEvents(track, 'remote');

			if(!this.onTrack) {
				console.warn('onTrack not defined')
				return
			}

			this.onTrack(track);
		};

		this.pc.onnegotiationneeded = async () => {
			try {
				this.makingOffer = true;
				await this.pc.setLocalDescription();
				//await server.sendDM(otherUser()?.id, JSON.stringify({ description: this.pc.localDescription }))
				await this.sendMessage({ description: this.pc.localDescription })
			} catch (err) {
				console.error(err);
			} finally {
				this.makingOffer = false;
			}
		};

		this.pc.oniceconnectionstatechange = () => {
			if (this.pc.iceConnectionState === "failed") {
				this.pc.restartIce();
			}

			if (this.pc.iceConnectionState === 'disconnected') {
				// onDisconnect()
				console.log('disconnect!')
			}
		};

		// this.pc.onicecandidate = ({ candidate }) => server.sendDM(otherUser()?.id, JSON.stringify({ candidate }));
		this.pc.onicecandidate = ({ candidate }) => this.sendMessage({ candidate })

		// this.pc.onsignalingstatechange = () => {
		// 	console.log(`RTCPeerConnection's signalingState changed: ${this.pc.signalingState}`)
		// }
	}

	addAbortController(ac: AbortController) {
		this.abortControllers.push(ac)
	}

	//https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
	//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTrack#adding_tracks_to_multiple_streams
	startCall(localStream: MediaStream) {
		console.log('startCall')
		this.addTracks(localStream)
		//this.onConnect(this.remoteStream)
	}

	addTracks(localStream: MediaStream) {
		// Push tracks from local stream to peer connection
		localStream.getTracks().forEach((track) => {
			console.log(`adding ${track.muted ? "muted" : "un-muted"} local ${track.kind} track to peer connection:`, track.label)
			this.localRTCRtpSenders.push(this.pc.addTrack(track, localStream))
			this.logTrackEvents(track, 'local');
		});
	}

	holdCall() {
		this.localRTCRtpSenders.forEach(t => {
			this.pc.removeTrack(t)
		})
	}

	resumeCall(localStream: MediaStream) {
		this.addTracks(localStream)
	}

	endCall() {
		console.groupCollapsed('end call...')

		this.abortControllers.forEach(ac => {
			ac.abort()
		})

		this.localRTCRtpSenders.forEach(t => {
			this.pc.removeTrack(t)
		})

		try {
			//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/close
			this.pc?.close();
		} catch (err) {
			console.error(err)
		}

		console.groupEnd()
	}

	logTrackEvents(track: MediaStreamTrack, label: 'local' | 'remote') {
		const ac = new AbortController()
		this.abortControllers.push(ac)
		track.addEventListener('ended', () => console.log(`ENDED: ${label} ${track.kind}: ${track.label}`), { signal: ac.signal })
		track.addEventListener('mute', () => console.log(`MUTE: ${label} ${track.kind}: ${track.label}`), { signal: ac.signal })
		track.addEventListener('unmute', () => console.log(`UNMUTE: ${label} ${track.kind}: ${track.label}`), { signal: ac.signal })
	}

	sendMessage (message: {}) {
		return server.sendWebRtcMessage(this.conId, JSON.stringify(message))
	}

	async handleMessage({ description, candidate }) {
		try {

			if (this.pc.signalingState === "closed") {
				console.warn(`RTCPeerConnection's signalingState is 'closed'... retrying...`);
				await new Promise((resolve) => setTimeout(() => resolve(''), 1)); //just give it a tick then try again...
			}

			if (description) {
				const offerCollision = description.type === "offer"
					&& (this.makingOffer || this.pc.signalingState !== "stable");

				this.ignoreOffer = this.polite && offerCollision;
				if (this.ignoreOffer) {
					return;
				}

				if (this.pc.signalingState === "closed") {
					console.error(`Ignoring offer description because The RTCPeerConnection's signalingState is 'closed'`, description);
					return;
				}

				await this.pc.setRemoteDescription(description);
				if (description.type === "offer") {
					await this.pc.setLocalDescription();
					// server.sendDM(otherUser()?.id, JSON.stringify({ description: this.pc.localDescription }));
					this.sendMessage({ description: this.pc.localDescription })
				}
			} else if (candidate) {
				try {
					if (this.pc.signalingState === "closed") {
						console.error(`Ignoring ice candidate because The RTCPeerConnection's signalingState is 'closed'`, candidate);
						return;
					}
					await this.pc.addIceCandidate(candidate);
				} catch (err) {
					if (!this.ignoreOffer) {
						throw err;
					}
				}
			}
		} catch (err) {
			console.warn(err);
		}
	}
}

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
export function ConnectVideo(conId: string, polite: boolean = true) {
	console.log('ConnectVideo', conId)

	if (!localStream) throw new Error('local stream not ready')
	if (peersById.has(conId)) {
		console.warn(`Peer already conneced! ${conId}`)
		return //already connected?
	}

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

	console.log('setPeer', conId)
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
	let localVideo: HTMLVideoElement
	let videoContainer: HTMLDivElement
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
		observer = new MutationObserver(() => localVideo?.classList.toggle('alone', videoContainer.childNodes.length === 1))
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
		<div>
			<video id="local-video" class="local alone" ref={localVideo} autoplay playsinline />
			<div>{myName()}</div>
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

	return <div>
		<video id={props.peer.conId} class="remote" ref={videoElement} autoplay playsinline />
		<div>{name()}</div>
	</div>
}