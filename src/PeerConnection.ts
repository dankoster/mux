import * as server from "./data/data";

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
	conId: string;
	polite: boolean;
	onTrack?: (track: MediaStreamTrack) => void;
	onDisconnect: () => void;
};
export class PeerConnection extends EventTarget {
	abortControllers: AbortController[] = [];
	conId: string;

	pc: RTCPeerConnection
	streams = new Set<MediaStream>()

	polite = false;
	makingOffer = false;
	ignoreOffer = false;

	onDisconnect: () => void;

	constructor({ conId, polite, onDisconnect }: pcInit) {
		super()

		this.conId = conId;
		this.pc = new RTCPeerConnection(servers);
		this.polite = polite;
		this.onDisconnect = onDisconnect;

		this.pc.ontrack = (e) => {
			console.log(`PeerConnection: got ${e.track.kind} ${e.type} from peer connection. Saving MediaStreams`, e.streams)
			this.logTrackEvents(e.track, 'remote')

			const streamCount = this.streams.size
			e.streams?.forEach(stream => this.streams.add(stream))
			if(streamCount != this.streams.size){
				this.dispatchEvent(new Event('PeerConnection:StreamsChanged'))}
		}

		this.pc.onnegotiationneeded = async () => {
			console.log('onnegotiationneeded')
			try {
				this.makingOffer = true;
				await this.pc.setLocalDescription();
				await server.sendWebRtcMessage(this.conId, JSON.stringify({ description: this.pc.localDescription }))
			} catch (err) {
				console.error(err);
			} finally {
				this.makingOffer = false;
			}
		};

		this.pc.oniceconnectionstatechange = () => {
			console.log('oniceconnectionstatechange', this.pc.iceConnectionState)
			if (this.pc.iceConnectionState === "failed") {
				this.pc.restartIce();
			}

			if (this.pc.iceConnectionState === 'disconnected') {
				this.onDisconnect()
			}
		};

		this.pc.onicecandidate = ({ candidate }) => server.sendWebRtcMessage(this.conId, JSON.stringify({ candidate }))

		this.pc.onsignalingstatechange = () => {
			console.log(`RTCPeerConnection's signalingState changed: ${this.pc.signalingState}`)
		}
	}

	addAbortController(ac: AbortController) {
		this.abortControllers.push(ac);
	}

	//https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
	//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTrack#adding_tracks_to_multiple_streams
	addTracks(stream: MediaStream) {
		// Push tracks from local stream to peer connection
		stream.getTracks().forEach((track) => {
			console.log(`adding ${track.enabled ? "enabled" : "disabled"} local ${track.kind} track to peer connection:`, track.label);
			// this.logTrackEvents(track, 'local');
			this.pc.addTrack(track, stream)
		});
	}
	
	removeTracks(stream: MediaStream) {
		stream.getTracks().forEach(track => {
			console.log(`removing ${track.enabled ? "enabled" : "disabled"} local ${track.kind} track from peer connection:`, track.label);
			const sender = this.pc.getSenders()
			.filter(sender => sender.track === track)
			.forEach(sender => {
				console.log('removing track', sender)
				this.pc.removeTrack(sender)
			})
		})
	}

	enableRemoteAudio(enabled: boolean) {
		this.pc.getReceivers()
			.filter(r => r.track.kind === 'audio')
			.forEach(r => r.track.enabled = enabled)

		// this.remoteStream.getAudioTracks()?.forEach(track => track.enabled = enabled)
	}

	endCall() {
		console.log('PeerConnection.endCall', this.conId);

		this.abortControllers.forEach(ac => {
			ac.abort();
		});

		try {
			//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/close
			this.pc.close();
		} catch (err) {
			console.error(err);
		}
	}

	logTrackEvents(track: MediaStreamTrack, label: 'local' | 'remote') {
		const ac = new AbortController();
		this.abortControllers.push(ac);
		track.addEventListener('ended', () => console.log(`ENDED: ${label} ${track.kind}: ${track.label}`), { signal: ac.signal });
		track.addEventListener('mute', () => console.log(`MUTE: ${label} ${track.kind}: ${track.label}`), { signal: ac.signal });
		track.addEventListener('unmute', () => console.log(`UNMUTE: ${label} ${track.kind}: ${track.label}`), { signal: ac.signal });
	}

	async handleMessage({ description, candidate }) {
		try {
			if (this.pc.signalingState === "closed") {
				console.warn(`RTCPeerConnection's signalingState is 'closed'... retrying...`);
				await new Promise((resolve) => setTimeout(() => resolve(''), 1)); //just give it a tick then try again...
			}

			if (description) {
				// console.log("handleMessage: description", description.type)
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
					server.sendWebRtcMessage(this.conId, JSON.stringify({ description: this.pc.localDescription }))
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
						console.warn(err)
					}
				}
			}
		} catch (err) {
			console.warn(err);
		}
	}
}
