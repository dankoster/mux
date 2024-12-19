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
export class PeerConnection {
	remoteStream = new MediaStream();
	abortControllers: AbortController[] = [];
	localRTCRtpSenders: RTCRtpSender[] = [];
	conId: string;

	pc: RTCPeerConnection;

	polite = false;
	makingOffer = false;
	ignoreOffer = false;

	onTrack: (track: MediaStreamTrack) => void;
	onDisconnect: () => void;

	constructor({ conId, polite, onDisconnect }: pcInit) {

		this.conId = conId;
		this.pc = new RTCPeerConnection(servers);
		this.polite = polite;
		this.onDisconnect = onDisconnect;

		// Pull tracks from remote stream, add to video stream
		this.pc.ontrack = (event) => {
			const track = event.track;
			console.log(`got ${event.type}: ${track.muted ? "muted" : "un-muted"} ${track.kind} from peer connection`, track.label);
			//track.addEventListener('end', () => this.remoteStream.removeTrack(track))
			//track.addEventListener('mute', () => this.remoteStream.removeTrack(track))
			//track.addEventListener('unmute', () => this.remoteStream.addTrack(track))
			this.remoteStream.addTrack(track);
			this.logTrackEvents(track, 'remote');

			if (!this.onTrack) {
				console.warn('onTrack not defined');
				return;
			}

			this.onTrack(track);
		};

		this.pc.onnegotiationneeded = async () => {
			try {
				this.makingOffer = true;
				await this.pc.setLocalDescription();
				await this.sendMessage({ description: this.pc.localDescription });
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
				this.onDisconnect()
			}
		};

		// this.pc.onicecandidate = ({ candidate }) => server.sendDM(otherUser()?.id, JSON.stringify({ candidate }));
		this.pc.onicecandidate = ({ candidate }) => this.sendMessage({ candidate });

		this.pc.onsignalingstatechange = () => {
			console.log(`RTCPeerConnection's signalingState changed: ${this.pc.signalingState}`)
		}
	}

	addAbortController(ac: AbortController) {
		this.abortControllers.push(ac);
	}

	//https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
	//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTrack#adding_tracks_to_multiple_streams
	startCall(localStream: MediaStream) {
		console.log('startCall');
		this.addTracks(localStream);
		//this.onConnect(this.remoteStream)
	}

	addTracks(localStream: MediaStream) {
		// Push tracks from local stream to peer connection
		localStream.getTracks().forEach((track) => {
			console.log(`adding ${track.muted ? "muted" : "un-muted"} local ${track.kind} track to peer connection:`, track.label);
			this.localRTCRtpSenders.push(this.pc.addTrack(track, localStream));
			this.logTrackEvents(track, 'local');
		});
	}

	holdCall() {
		//don't close the connection, just don't send anything
		// could replace tracks to send hold music or something
		this.localRTCRtpSenders.forEach(sender => {
			console.log('holdCall - removing', sender)
			this.pc.removeTrack(sender);
		});
	}

	resumeCall(localStream: MediaStream) {
		this.addTracks(localStream);
	}

	endCall() {
		console.groupCollapsed('end call...');

		this.abortControllers.forEach(ac => {
			ac.abort();
		});

		this.localRTCRtpSenders.forEach(t => {
			this.pc.removeTrack(t);
		});

		try {
			//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/close
			this.pc?.close();
		} catch (err) {
			console.error(err);
		}

		console.groupEnd();
	}

	logTrackEvents(track: MediaStreamTrack, label: 'local' | 'remote') {
		const ac = new AbortController();
		this.abortControllers.push(ac);
		track.addEventListener('ended', () => console.log(`ENDED: ${label} ${track.kind}: ${track.label}`), { signal: ac.signal });
		track.addEventListener('mute', () => console.log(`MUTE: ${label} ${track.kind}: ${track.label}`), { signal: ac.signal });
		track.addEventListener('unmute', () => console.log(`UNMUTE: ${label} ${track.kind}: ${track.label}`), { signal: ac.signal });
	}

	sendMessage(message: {}) {
		return server.sendWebRtcMessage(this.conId, JSON.stringify(message));
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
					this.sendMessage({ description: this.pc.localDescription });
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
