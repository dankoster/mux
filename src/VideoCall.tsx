
import { createEffect, createSignal, For, onCleanup, onMount, Setter, Show } from "solid-js";
import "./VideoCall.css"
import server from "./data"
import { Connection, Room } from "../server/api";

//TODO: get this from the TURN server for each client, obviously
const servers: RTCConfiguration = {
	iceServers: [
		// {
		// 	urls: [
		// 		'stun:stun1.l.google.com:19302',
		// 		'stun:stun2.l.google.com:19302'
		// 	],
		// },
		{
			urls: "stun:stun.relay.metered.ca:80",
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
	onConnect: (localStream: MediaStream, remoteStream: MediaStream) => void,
	onDisconnect: () => void
}

class PeerConnection extends EventTarget {
	localStream: MediaStream | undefined
	remoteStream = new MediaStream();
	abortControllers: AbortController[] = []
	localRTCRtpSenders: RTCRtpSender[] = []

	constraints = { audio: true, video: true }

	pc: RTCPeerConnection

	polite = false;
	makingOffer = false;
	ignoreOffer = false;

	onConnect: (localStream: MediaStream, remoteStream: MediaStream) => void
	onDisconnect: () => void
	sendMessage: (message: {}) => Promise<Response>

	constructor({ polite, onConnect, onDisconnect, sendMessage }: pcInit) {
		super()

		this.pc = new RTCPeerConnection(servers)
		this.onConnect = onConnect
		this.onDisconnect = onDisconnect
		this.sendMessage = sendMessage
		this.polite = polite

		// Pull tracks from remote stream, add to video stream
		this.pc.ontrack = (event) => {
			const track = event.track
			// console.log(`got ${event.type}: ${track.muted ? "muted" : "un-muted"} ${track.kind} from peer connection`, track.label)
			track.addEventListener('end', () => this.remoteStream.removeTrack(track))
			// track.addEventListener('mute', () => this.remoteStream.removeTrack(track))
			track.addEventListener('unmute', () => this.remoteStream.addTrack(track))
			//this.remoteStream.addTrack(track);
			this.logTrackEvents(track, 'remote');
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
	async startCall() {
		try {
			this.localStream = await navigator.mediaDevices.getUserMedia(this.constraints);
			if (this.localStream) {
				// Push tracks from local stream to peer connection
				this.localStream?.getTracks().forEach((track) => {
					// console.log(`adding ${track.muted ? "muted" : "un-muted"} local ${track.kind} track to peer connection:`, track.label)
					this.localRTCRtpSenders.push(this.pc?.addTrack(track, this.localStream))
					this.logTrackEvents(track, 'local');
				});

				this.onConnect(this.localStream, this.remoteStream)
			}
		} catch (err) {
			console.error(err);
		}
	}

	endCall() {
		console.groupCollapsed('end call...')

		this.abortControllers.forEach(ac => {
			ac.abort()
		})

		this.localRTCRtpSenders.forEach(t => {
			this.pc.removeTrack(t)
		})

		this.localStream?.getTracks().forEach((track) => {
			track.stop()
			this.localStream.removeTrack(track)
		})

		try {
			//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/close
			this.pc?.close();
		} catch (err) {
			console.error(err)
		}

		this.onDisconnect()

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

export default function VideoCall(props: { room: Room, user: Connection, connections: Connection[] }) {

	if (!props.user) {
		return "no user"
	}

	let localVideo: HTMLVideoElement

	const peersById = new Map<string, PeerConnection>()
	const videosById = new Map<string, HTMLVideoElement>()

	function createPeer(polite: boolean, con: Connection, remoteVideo: HTMLVideoElement) {
		const pc = new PeerConnection({
			polite,
			sendMessage: (message: {}) => {
				return server.sendDM(con.id, JSON.stringify(message))
			},
			onConnect: (localStream: MediaStream, remoteStream: MediaStream) => {
				if (localVideo) {
					localVideo.srcObject = localStream;
					localVideo.muted = true;
				}

				if (remoteVideo) {
					remoteVideo.srcObject = remoteStream;
				}
			},
			onDisconnect: () => {
				remoteVideo.srcObject = null
			}
		})
		const ac = server.onDM((dm) => {
			const { description, candidate } = JSON.parse(dm.message);

			//only handle messages from this peer
			if (dm.senderId === con.id)
				pc.handleMessage({ description, candidate })
		})

		//cleanup the onDM evnet handler when we're done
		pc.addAbortController(ac)

		return pc
	}

	createEffect(() => {
		//create new peer connections as necessary
		const polite = props.user?.id === props.room?.ownerId
		props.connections.forEach(con => {
			if (!peersById.has(con.id)) {
				const video = document.createElement('video')
				video.className = "remote"
				video.setAttribute('autoplay', '')
				video.setAttribute('playsinline', '')
				video.setAttribute('id', con.id)
				videosById.set(con.id, video)
				document.getElementById('remote-videos')?.appendChild(video)
				const peer = createPeer(polite, con, video)
				peersById.set(con.id, peer)
				peer.startCall()
			}
		})

		//remove old peer connections
		const conIds = props.connections.map(con => con.id)
		peersById.forEach((value, key) => {
			if (!conIds.includes(key)) {
				peersById.get(key)?.endCall()
				peersById.delete(key)

				const video = videosById.get(key)
				document.getElementById('remote-videos')?.removeChild(video)
				videosById.delete(key)
			}
		})
	})

	onCleanup(() => {
		peersById.forEach(peer => peer.endCall())
	})

	return <div class="video-call">
		<Show when={props.connections?.length > 0}>
			<div class="local-video-container">
				<video class="local" ref={localVideo} autoplay playsinline></video>
			</div>
			<div id="remote-videos" class="remote-video-container" />
		</Show>
		<Show when={props.user.roomId && props.connections?.length === 0}>
			waiting for someone else to join...
		</Show>
	</div>
}