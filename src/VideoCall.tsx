
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { trackStore } from "@solid-primitives/deep"
import "./VideoCall.css"
import server from "./data"
import { Connection, Room } from "../server/api";

export default function VideoCall(props: { user: Connection }) {

	if (!props.user) {
		return "no user"
	}

	const [room, setRoom] = createSignal<Room>()
	const [isRoomOwner, setIsRoomOwner] = createSignal<boolean>()

	createEffect(() => {
		trackStore(server.rooms);
		const room = server.rooms.find(room => room.id === props.user.roomId)
		setRoom(room)
		setIsRoomOwner(room && room.ownerId === props.user.id)
	});

	const servers: RTCConfiguration = {
		iceServers: [
			{
				urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
			},
		],
		iceCandidatePoolSize: 10,
	};


	let localStream: MediaStream | undefined
	let remoteStream = new MediaStream();

	let webcamVideo: HTMLVideoElement
	let callButton: HTMLButtonElement
	let endButton: HTMLButtonElement
	let remoteVideo: HTMLVideoElement


	const constraints = { audio: true, video: true };
	const pc = new RTCPeerConnection(servers);
	//TODO: create peer connection for each other user in the room!!!!

	function logTrackEvents(track: MediaStreamTrack, label: 'local' | 'remote') {
		track.addEventListener('ended', () => console.log(`ENDED: ${label} ${track.kind}: ${track.label}`));
		track.addEventListener('mute', () => console.log(`MUTE: ${label} ${track.kind}: ${track.label}`));
		track.addEventListener('unmute', () => console.log(`UNMUTE: ${label} ${track.kind}: ${track.label}`));
	}

	function end() {

		localStream?.getTracks().forEach((track) => {
			console.log(`stopping ${track.muted ? "muted" : "un-muted"} local ${track.kind} track:`, track.label)
			track.stop()
		});

		//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/close
		pc?.close();

		server.exitRoom(props.user.roomId)
	}

	//https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
	async function start() {
		try {
			localStream = await navigator.mediaDevices.getUserMedia(constraints);
			if (localStream) {
				// Push tracks from local stream to peer connection
				localStream?.getTracks().forEach((track) => {
					console.log(`adding ${track.muted ? "muted" : "un-muted"} local ${track.kind} track to peer connection:`, track.label)
					pc?.addTrack(track, localStream);
					logTrackEvents(track, 'local');
				});

				if (webcamVideo) {
					webcamVideo.srcObject = localStream;
					webcamVideo.muted = true;
				}

				if (remoteVideo) {
					remoteVideo.srcObject = remoteStream;
				}
			}
		} catch (err) {
			console.error(err);
		}
	}

	// Pull tracks from remote stream, add to video stream
	pc.ontrack = (event) => {
		const track = event.track
		console.log(`got ${event.type}: ${track.muted ? "muted" : "un-muted"} ${track.kind} from peer connection`, track.label)
		remoteStream.addTrack(track);
		logTrackEvents(track, 'remote');
	};

	const otherUser = () => server.connections.find(con => con.id !== props.user.id && con.roomId === props.user.roomId)
	const polite = !isRoomOwner()

	let makingOffer = false;
	pc.onnegotiationneeded = async () => {
		try {
			makingOffer = true;
			await pc.setLocalDescription();
			await server.sendDM(otherUser()?.id, JSON.stringify({ description: pc.localDescription }))
		} catch (err) {
			console.error(err);
		} finally {
			makingOffer = false;
		}
	};

	pc.oniceconnectionstatechange = () => {
		if (pc.iceConnectionState === "failed") {
			pc.restartIce();
		}
	};

	pc.onicecandidate = ({ candidate }) => server.sendDM(otherUser()?.id, JSON.stringify({ candidate }));

	let ignoreOffer = false;
	server.onDM(async dm => {
		try {
			const { description, candidate } = JSON.parse(dm.message)
			console.log(`DM from: ${dm.senderId}`, { description, candidate })

			if (description) {
				const offerCollision = description.type === "offer"
					&& (makingOffer || pc.signalingState !== "stable");

				ignoreOffer = !polite && offerCollision;
				if (ignoreOffer) {
					return;
				}

				await pc.setRemoteDescription(description);
				if (description.type === "offer") {
					await pc.setLocalDescription();
					server.sendDM(otherUser()?.id, JSON.stringify({ description: pc.localDescription }));
				}
			} else if (candidate) {
				try {
					await pc.addIceCandidate(candidate);
				} catch (err) {
					if (!ignoreOffer) {
						throw err;
					}
				}
			}
		} catch (err) {
			console.error(err);
		}
	})

	onCleanup(() => {
		console.log('video call cleanup')
		end()
	})

	onMount(() => {
		start()
	})

	return <div class="video-call">
		<div class="video-container">
			<video class="local" ref={webcamVideo} autoplay playsinline></video>
		</div>
		<div class="video-container">
			<video class="remote" ref={remoteVideo} autoplay playsinline></video>
		</div>
		{/* <button class="room-button" ref={callButton} onclick={start}>Join</button>
		<button class="room-button" ref={endButton} onclick={end}>Exit</button> */}
	</div>
}
