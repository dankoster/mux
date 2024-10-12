
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
// import { trackStore } from "@solid-primitives/deep"
import "./VideoCall.css"
import server from "./data"
import { Connection, Room } from "../server/api";

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
	loggingAbortControllers: AbortController[] = []
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
			console.log(`got ${event.type}: ${track.muted ? "muted" : "un-muted"} ${track.kind} from peer connection`, track.label)
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
			console.log('oniceconnectionstatechange', this.pc.iceConnectionState, this.pc.signalingState)
			if (this.pc.iceConnectionState === "failed") {
				this.pc.restartIce();
			}

			if (this.pc.iceConnectionState === 'disconnected') {
				onDisconnect()
				console.log(this.remoteStream)
			}
		};

		// this.pc.onicecandidate = ({ candidate }) => server.sendDM(otherUser()?.id, JSON.stringify({ candidate }));
		this.pc.onicecandidate = ({ candidate }) => sendMessage({ candidate })

		this.pc.onsignalingstatechange = () => {
			console.log(`RTCPeerConnection's signalingState changed: ${this.pc.signalingState}`)
		}

		console.log('PeerConnection: constructor finised!', this)
	}

	//https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
	//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTrack#adding_tracks_to_multiple_streams
	async startCall() {
		try {
			this.localStream = await navigator.mediaDevices.getUserMedia(this.constraints);
			if (this.localStream) {
				// Push tracks from local stream to peer connection
				this.localStream?.getTracks().forEach((track) => {
					console.log(`adding ${track.muted ? "muted" : "un-muted"} local ${track.kind} track to peer connection:`, track.label)
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

		this.loggingAbortControllers.forEach(ac => {
			console.log('aborting track logging event listeners!')
			ac.abort()
		})

		this.localRTCRtpSenders.forEach(t => {
			this.pc.removeTrack(t)
			console.log('removed local RTCRtpSender', t)
		})

		this.localStream?.getTracks().forEach((track) => {
			track.stop()
			this.localStream.removeTrack(track)
			console.log(`stopped ${track.muted ? "muted" : "un-muted"} local ${track.kind} track:`, track.label)
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
		this.loggingAbortControllers.push(ac)
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


	// createEffect(() => {
	// 	trackStore(server.rooms);
	// 	const r = server.rooms.find(rr => rr.id === props.owner.roomId)
	// 	setRoom(r)
	// 	setIsRoomOwner(r && r.ownerId === props.owner.id)

	// 	console.log('trackStore(rooms)', r, isRoomOwner ? 'owner' : 'guest')
	// });


	let webcamVideo: HTMLVideoElement
	let remoteVideo: HTMLVideoElement

	const pm = new PeerConnection({
		polite: props.user?.id === props.room?.ownerId,
		sendMessage: (message: {}) => {
			return server.sendDM(otherUser()?.id, JSON.stringify(message))
		},
		onConnect: (localStream: MediaStream, remoteStream: MediaStream) => {
			if (webcamVideo) {
				webcamVideo.srcObject = localStream;
				webcamVideo.muted = true;
			}

			if (remoteVideo) {
				remoteVideo.srcObject = remoteStream;
			}
		},
		onDisconnect: () => {
			remoteVideo.srcObject = null

			// const roomId = props.user.roomId
			// if (roomId)
			// 	server.exitRoom(roomId)
		}
	})
	server.onDM((dm) => {
		const { description, candidate } = JSON.parse(dm.message);
		console.log(`DM from: ${dm.senderId}`, { description, candidate });

		//TODO: route this message to the correct peer connection for the sender

		pm.handleMessage({ description, candidate })
	})

	console.log("------------------- Created Peer Connection! -------------------")
	//TODO: create peer connection for each other user in the room!!!!


	const otherUser = () => props.connections[0]

	onCleanup(() => {
		console.log('video call cleanup ... other side ended call!')
		pm.endCall()
	})

	onMount(() => {
		if (otherUser()) {
			console.log('OTHER USER exists! Start the call!')
			pm.startCall()
		} else {
			console.log(`it's quiet... waiting for someone else to join...`)
		}
	})

	createEffect(() => {
		console.log("EFFECT", props.connections)
		if (props.connections.length > 0) {
			console.log('someone joined!!!')
			pm.startCall()
		}
	})

	return <div class="video-call">
		<div class="video-container">
			<video class="local" ref={webcamVideo} autoplay playsinline></video>
		</div>
		<div class="video-container">
			<video class="remote" ref={remoteVideo} autoplay playsinline></video>
		</div>
		<div class="connections">
			<Participant con={props.user} ownsRoom={true} />
			<For each={props.connections}>
				{con => <Participant con={con} ownsRoom={false} />}
			</For>
		</div>
	</div>
}

function Participant(props: { con: Connection, ownsRoom: boolean }) {
	return <div>
		{props.ownsRoom ? "owner" : "guest"}
		<span style={{ "background-color": props.con.color, "margin-inline": "1rem" }}>{props.con.id.substring(props.con.id.length - 4)}</span>
		{props.con.status || 'offline'}
	</div>
}