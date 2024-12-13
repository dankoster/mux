
import { onCleanup, onMount } from "solid-js";
import "./VideoCall.css"
import * as server from "./data/data"
import type { DM } from "../server/types"
import { onCallEvent, sendDm } from "./data/directMessages";

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
	polite: boolean,
	sendMessage: (message: {}) => Promise<Response>,
	onConnect: (remoteStream: MediaStream) => void,
	onDisconnect: () => void,
	onTrack: (track: MediaStreamTrack) => void
}

class PeerConnection extends EventTarget {
	remoteStream = new MediaStream();
	abortControllers: AbortController[] = []
	localRTCRtpSenders: RTCRtpSender[] = []

	pc: RTCPeerConnection

	polite = false;
	makingOffer = false;
	ignoreOffer = false;

	onConnect: (remoteStream: MediaStream) => void
	onTrack: (track: MediaStreamTrack) => void
	onDisconnect: () => void
	sendMessage: (message: {}) => Promise<Response>

	constructor({ polite, onConnect, onTrack, onDisconnect, sendMessage }: pcInit) {
		super()

		this.pc = new RTCPeerConnection(servers)
		this.onConnect = onConnect
		this.onTrack = onTrack
		this.onDisconnect = onDisconnect
		this.sendMessage = sendMessage
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
			this.onTrack(track);
		};

		this.pc.onnegotiationneeded = async () => {
			try {
				this.makingOffer = true;
				await this.pc.setLocalDescription();
				//await server.sendDM(otherUser()?.id, JSON.stringify({ description: this.pc.localDescription }))
				await sendMessage({ description: this.pc.localDescription })
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
				onDisconnect()
			}
		};

		// this.pc.onicecandidate = ({ candidate }) => server.sendDM(otherUser()?.id, JSON.stringify({ candidate }));
		this.pc.onicecandidate = ({ candidate }) => sendMessage({ candidate })

		// this.pc.onsignalingstatechange = () => {
		// 	console.log(`RTCPeerConnection's signalingState changed: ${this.pc.signalingState}`)
		// }
	}

	addAbortController(ac: AbortController) {
		this.abortControllers.push(ac)
	}

	//https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
	//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTrack#adding_tracks_to_multiple_streams
	async startCall(localStream: MediaStream) {
		// Push tracks from local stream to peer connection
		localStream.getTracks().forEach((track) => {
			console.log(`adding ${track.muted ? "muted" : "un-muted"} local ${track.kind} track to peer connection:`, track.label)
			this.localRTCRtpSenders.push(this.pc?.addTrack(track, localStream))
			this.logTrackEvents(track, 'local');
		});

		this.onConnect(this.remoteStream)
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
	end: (conId) => {
		if (videosById.has(conId) || peersById.has(conId))
			DisconnectVideo(conId)
	}
}

onCallEvent(dm => {
	console.log('onCallEvent', dm)
	handleConnectionCommand[dm.message as ConnectionCommand](dm.fromId)
})


//both sides need to call this funciton
export function ConnectVideo(conId: string, polite: boolean = true) {
	console.log('ConnectVideo', conId)

	if (!localStream) throw new Error('local stream not ready')
	if (peersById.has(conId)) return //already connected?

	SendVideoCallRequest(conId, 'start')

	const remoteVideo = document.createElement('video')
	remoteVideo.className = "remote"
	remoteVideo.setAttribute('autoplay', '')
	remoteVideo.setAttribute('playsinline', '')
	remoteVideo.setAttribute('id', conId)
	videosById.set(conId, remoteVideo)
	const videoContainer = document.getElementById('videos-container')

	function handleMuteEvent(track: MediaStreamTrack): any {
		console.log('handleMuteEvent', track)
		remoteVideo.classList.toggle(`${track.kind}-muted`, track.muted)

		if (track.kind === 'video') {
			if (track.muted)
				remoteVideo.remove()
			else
				videoContainer.appendChild(remoteVideo)
		}
	}

	const peer = new PeerConnection({
		polite,
		sendMessage: (message: {}) => {
			return server.sendWebRtcMessage(conId, JSON.stringify(message))
		},
		onConnect: (remoteStream: MediaStream) => {
			remoteVideo.srcObject = remoteStream;
		},
		onDisconnect: () => {
			DisconnectVideo(conId)
		},
		onTrack: (track: MediaStreamTrack) => {
			track.addEventListener('mute', () => handleMuteEvent(track))
			track.addEventListener('unmute', () => handleMuteEvent(track))
			handleMuteEvent(track)
		}
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
	peer.startCall(localStream)
}

export function DisconnectVideo(conId: string) {
	console.log('DisconnectVideo', conId)
	peersById.get(conId)?.endCall()
	peersById.delete(conId)

	const video = videosById.get(conId)
	video?.remove()
	videosById.delete(conId)

	SendVideoCallRequest(conId, 'end')
}

const peersById = new Map<string, PeerConnection>()
const videosById = new Map<string, HTMLVideoElement>()

export default function VideoCall() {
	let localVideo: HTMLVideoElement
	let videoContainer: HTMLDivElement
	let observer: MutationObserver

	onMount(async () => {

		//connect local video
		localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
		localVideo.srcObject = localStream;
		localVideo.muted = true;

		//handle style changes when videos are added and removed
		observer = new MutationObserver(() => localVideo?.classList.toggle('alone', videoContainer.childNodes.length === 1))
		observer.observe(videoContainer, { childList: true })
	})

	onCleanup(() => {
		peersById.forEach(peer => peer.endCall())
		observer?.disconnect()
	})

	return <div id="videos-container" class="video-call" ref={videoContainer}>
		<video id="local-video" class="local alone" ref={localVideo} autoplay playsinline></video>
	</div>
}