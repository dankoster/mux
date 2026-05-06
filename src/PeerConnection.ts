import * as server from "./data/data";

type pcInit = {
	conId: string;
	polite: boolean;
	config: RTCConfiguration,
	onTrack?: (track: MediaStreamTrack) => void;
	onDisconnect: () => Promise<void>;
};
export class PeerConnection extends EventTarget {
	abortControllers: {[key:string]:AbortController} = {};
	conId: string;

	pc: RTCPeerConnection
	streams = new Set<MediaStream>()

	polite = false;
	makingOffer = false;
	ignoreOffer = false;

	static STREAMS_CHANGED = "PeerConnection:StreamsChanged";

	onDisconnect: () => Promise<void>;

	constructor({ conId, polite, onDisconnect, config }: pcInit) {
		super()

		this.conId = conId;
		this.pc = new RTCPeerConnection(config);
		this.polite = polite;
		this.onDisconnect = onDisconnect;

		this.pc.ontrack = (e) => {
			console.log(`PeerConnection: got ${e.track.kind} ${e.type} from peer connection. Saving MediaStreams`, e.streams)
			this.logTrackEvents(e.track, 'remote')
			
			const streamCount = this.streams.size
			e.streams?.forEach(stream => this.streams.add(stream))
			if(streamCount != this.streams.size){
				console.log(`pc.ontrack -----------> added ${this.streams.size} streams`)
				this.dispatchEvent(new Event(PeerConnection.STREAMS_CHANGED))
			}
			
			//when any stream tracks are muted, remove the stream
			e.track.addEventListener('mute', () => {
				
				console.log(`pc.ontrack -----------> removing stream: remote ${e.track.kind}: ${e.track.label}`)
				e.streams?.forEach(stream => this.streams.delete(stream))
				this.dispatchEvent(new Event(PeerConnection.STREAMS_CHANGED))
			})
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

	//https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
	//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTrack#adding_tracks_to_multiple_streams
	addTracks(stream: MediaStream) {
		// Push tracks from local stream to peer connection
		stream?.getTracks().forEach((track) => {
			console.log(`adding ${track.enabled ? "enabled" : "disabled"} local ${track.kind} track to peer connection:`, track.label);
			// this.logTrackEvents(track, 'local');
			if(this.pc.signalingState != 'closed')
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

		for(var ac in this.abortControllers)
		{
			console.log('endCall - aborting:', ac)
			this.abortControllers[ac].abort();
			delete this.abortControllers[ac]
		}

		try {
			//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/close
			this.pc.close();
		} catch (err) {
			console.error(err);
		}
	}

	logTrackEvents(track: MediaStreamTrack, label: 'local' | 'remote') {
		const ac = new AbortController();
		this.abortControllers[`${label}_${track.kind}_${track.label}`] = ac;
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
