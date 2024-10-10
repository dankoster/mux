
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { trackStore } from "@solid-primitives/deep"
import "./VideoCall.css"
import server from "./data"
import { Connection, Room } from "../server/api";

export default function VideoCall(props: { owner: Connection, connections: Connection[] }) {

	if (!props.owner) {
		return "no user"
	}

	const [room, setRoom] = createSignal<Room>()
	const [isRoomOwner, setIsRoomOwner] = createSignal<boolean>()

	createEffect(() => {
		trackStore(server.rooms);
		const room = server.rooms.find(room => room.id === props.owner.roomId)
		setRoom(room)
		setIsRoomOwner(room && room.ownerId === props.owner.id)

		console.log('trackStore(rooms)', room, isRoomOwner ? 'owner' : 'guest')
	});

	const servers: RTCConfiguration = {
		iceServers: [
			{
				urls: [
					'stun:stun1.l.google.com:19302',
					'stun:stun2.l.google.com:19302'
				],
			},
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


	let localStream: MediaStream | undefined
	let remoteStream = new MediaStream();

	let webcamVideo: HTMLVideoElement
	let remoteVideo: HTMLVideoElement

	const constraints = { audio: true, video: true };
	const pc = new RTCPeerConnection(servers);
	//TODO: create peer connection for each other user in the room!!!!

	function logTrackEvents(track: MediaStreamTrack, label: 'local' | 'remote') {
		track.addEventListener('ended', () => console.log(`ENDED: ${label} ${track.kind}: ${track.label}`));
		track.addEventListener('mute', () => console.log(`MUTE: ${label} ${track.kind}: ${track.label}`));
		track.addEventListener('unmute', () => console.log(`UNMUTE: ${label} ${track.kind}: ${track.label}`));
	}

	function endCall() {
		console.groupCollapsed('end call...')
		localStream?.getTracks().forEach((track) => {
			console.log(`stopping ${track.muted ? "muted" : "un-muted"} local ${track.kind} track:`, track.label)
			track.stop()
		});
		remoteStream?.getTracks().forEach((track) => {
			console.log(`stopping ${track.muted ? "muted" : "un-muted"} remote ${track.kind} track:`, track.label)
			track.stop()
		});

		if (webcamVideo) webcamVideo.srcObject = null
		if (remoteVideo) remoteVideo.srcObject = null

		try {
			//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/close
			pc?.close();
		} catch (err) {
			console.error(err)
		}

		const roomId = room()?.id
		if (roomId)
			server.exitRoom(roomId)

		console.groupEnd()
	}

	//https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
	async function startCall() {
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

	const otherUser = () => server.connections.find(con => con.id !== props.owner.id && con.roomId === props.owner.roomId)
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
		console.log('video call cleanup ... other side ended call!')
		endCall()
	})

	onMount(() => {
		if (otherUser()) {
			startCall()
		} else {
			console.log(`it's quiet... waiting for someone else to join...`)
		}
	})

	createEffect(() => {
		console.log("EFFECT", props.connections)
		if (props.connections.length > 0) {
			console.log('someone joined!!!')
			startCall()
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
			<Participant roomOwnerId={room()?.ownerId} con={props.owner} />
			<For each={props.connections}>
				{con => <Participant roomOwnerId={room()?.ownerId} con={con} />}
			</For>
		</div>
	</div>
}

function Participant(props: { con: Connection, roomOwnerId: string }) {
	return <div>
		{props.roomOwnerId === props.con.id ? "owner" : "guest"}
		<span style={{ "background-color": props.con.color }}>{props.con.id.substring(props.con.id.length - 4)}</span>
		{props.con.status}
		{props.con.text}
	</div>
}