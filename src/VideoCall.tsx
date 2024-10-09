
//from https://github.com/fireship-io/webrtc-firebase-demo
import { createEffect, createSignal, Show } from "solid-js";
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

	const servers = {
		iceServers: [
			{
				urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
			},
		],
		iceCandidatePoolSize: 10,
	};


	let localStream: MediaStream = null;
	let remoteStream = new MediaStream();

	let webcamButton: HTMLButtonElement
	let webcamVideo: HTMLVideoElement
	let callButton: HTMLButtonElement
	let answerButton: HTMLButtonElement
	let remoteVideo: HTMLVideoElement
	let hangupButton: HTMLButtonElement

	//TODO: create peer connection for each other user in the room!!!!

	//TODO: 
	// require webcam start before anything else can happen
	// answer button for non-owners only
	// start call button for room owner only
	// don't play local audio locally
	// hangup button for everyone 
	// close streams when leaving room
	// ability to join call that is already started
	// reconnect on page refresh. Same as joining an active call.


	const [onlineStatus, setOnlineStatus] = createSignal<RTCPeerConnectionState>()
	const [webcamOnline, setWebcamOnline] = createSignal(false)
	const [localStartedCall, setLocalStartedCall] = createSignal(false)
	const [remoteStartedCall, setRemoteStartedCall] = createSignal(false)
	const pc = new RTCPeerConnection(servers);

	pc.onconnectionstatechange = (event) => {
		setOnlineStatus(pc.connectionState)

		if (pc.connectionState === "connected")
			remoteVideo.srcObject = remoteStream;
	}

	// Pull tracks from remote stream, add to video stream
	pc.ontrack = (event) => {
		const track = event.track
		console.log(`got ${event.type}: ${track.kind} from peer connection`, track.label)
		remoteStream.addTrack(track);
		logTrackEvents(track, 'remote');
	};

	// Get candidates for caller, save to db
	pc.onicecandidate = (event) => {
		//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/icecandidate_event

		//@ts-expect-error
		if (event.candidate === "") {
			//there are no further candidates to come in this generation
		}
		else if (event.candidate === null) {
			//all ICE gathering on all transports is complete
		}
		else if (event.candidate) {
			if (localStartedCall()) {
				console.log('onicecandidate', 'addOfferCandidate')
				server.addOfferCandidate(event.candidate)
			} else {
				console.log('onicecandidate', 'addAnswerCandidate')
				server.addAnswerCandidate(event.candidate)
			}
		}
		else
			throw new Error("onicecandidate - unknown candidate state!")

	};



	function logTrackEvents(track: MediaStreamTrack, label: 'local' | 'remote') {
		track.addEventListener('ended', () => console.log(`ENDED: ${label} ${track.kind}: ${track.label}`));
		track.addEventListener('mute', () => console.log(`MUTE: ${label} ${track.kind}: ${track.label}`));
		track.addEventListener('unmute', () => console.log(`UNMUTE: ${label} ${track.kind}: ${track.label}`));
	}

	server.onSessionDescriptionAdded((session) => {
		console.log("onSessionDescriptionAdded", session)
	})

	// When answered, add candidate to peer connection
	server.onAnswerCandidateAdded((candidate: RTCIceCandidate) => {
		console.log('onAnswerCandidateAdded', candidate)
		pc.addIceCandidate(candidate)
	})

	// Listen for remote answer
	server.onRemoteAnswered((answer: RTCSessionDescription) => {
		console.log('onRemoteAnswered', answer)
		pc.setRemoteDescription(answer)
	})

	let pendingRemoteDescriptionRequest: Promise<RTCSessionDescriptionInit> = null
	server.onOfferCandidateAdded(async (candidate) => {
		console.log('onOfferCandidateAdded', candidate)

		if (pc.remoteDescription) {
			pc.addIceCandidate(candidate)
			return
		}

		if (pendingRemoteDescriptionRequest) {
			console.log('waiting for remote description request...')
			await pendingRemoteDescriptionRequest
			pc.addIceCandidate(candidate)
			return
		}

		console.log('fetching remote description...')
		pendingRemoteDescriptionRequest = server.getRoomSessionDescription()
		const offerDescription = await pendingRemoteDescriptionRequest
		if (!offerDescription)
			throw new Error('failed to get offer description')

		console.log("got remote description!", offerDescription)
		await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
		setRemoteStartedCall(true)
	})

	console.log('joined room: fetching remote description...')
	server.getRoomSessionDescription().then(async offerDescription => {
		if (offerDescription) {
			console.log("got remote description!", offerDescription)
			await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
			setRemoteStartedCall(true)
		}
		else console.log('no remote description available')
	})

	const webcamButton_onclick = async () => {
		localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

		// Push tracks from local stream to peer connection
		localStream.getTracks().forEach((track) => {
			console.log(`adding local ${track.kind} track to peer connection:`, track.label)
			pc.addTrack(track, localStream);
			logTrackEvents(track, 'local');
		});

		setWebcamOnline(true)

		webcamVideo.srcObject = localStream;
		webcamVideo.muted = true;
	};

	// 2. Create an offer
	const callButton_onclick = async () => {

		setLocalStartedCall(true)

		// Create offer
		const offerDescription = await pc.createOffer();
		await pc.setLocalDescription(offerDescription);

		await server.setRoomSessionDescription({
			sdp: offerDescription.sdp,
			type: offerDescription.type,
		})
	};

	// 3. Answer the call with the unique ID
	const answerButton_onclick = async () => {

		setLocalStartedCall(false)

		const answerDescription = await pc.createAnswer();
		await pc.setLocalDescription(answerDescription);

		await server.sendAnswer({
			type: answerDescription.type,
			sdp: answerDescription.sdp,
		})
	};

	const hangupButton_onclick = async () => {
		pc.close()

		//https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/close
		//Make sure that you delete all references to the previous RTCPeerConnection 
		//before attempting to create a new one that connects to the same remote peer, 
		//as not doing so might result in some errors depending on the browser.
	}

	return <div class="video-call">
		<Show when={!room()}>NO ROOM</Show>
		<Show when={webcamOnline()}>
			<div class="video-container">
				<video class="local" ref={webcamVideo} autoplay playsinline></video>
			</div>
		</Show>
		<Show when={onlineStatus() === "connected"}>
			<div class="video-container">
				<video class="remote" ref={remoteVideo} autoplay playsinline></video>
			</div>
			<button ref={hangupButton} onclick={hangupButton_onclick}>Hangup</button>
		</Show>
		<Show when={!webcamOnline()}>
			<button ref={webcamButton} onclick={webcamButton_onclick}>Start webcam</button>
		</Show>
		<Show when={webcamOnline() && isRoomOwner() && !localStartedCall()}>
			<button ref={callButton} onclick={callButton_onclick}>Create Video call</button>
			<Show when={onlineStatus() !== "connected"}>
				<div>Waiting for other side to join...</div>
			</Show>
		</Show>
		<Show when={webcamOnline() && !isRoomOwner() && onlineStatus() !== "connected"}>
			<Show when={!remoteStartedCall()}>
				<div>Waiting for host to start the call...</div>
			</Show>
			<Show when={remoteStartedCall()}>
				<button ref={answerButton} onclick={answerButton_onclick}>Join video call</button>
			</Show>
		</Show>
	</div>
}
