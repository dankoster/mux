
//from https://github.com/fireship-io/webrtc-firebase-demo
import "./VideoCall.css"
import server from "./data"

export default function VideoCall(props: { roomID: string }) {
	const servers = {
		iceServers: [
			{
				urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
			},
		],
		iceCandidatePoolSize: 10,
	};

	const pc = new RTCPeerConnection(servers);
	let localStream = null;
	let remoteStream = null;

	let webcamButton: HTMLButtonElement
	let webcamVideo: HTMLVideoElement
	let callButton: HTMLButtonElement
	let callInput: HTMLInputElement
	let answerButton: HTMLButtonElement
	let remoteVideo: HTMLVideoElement
	let hangupButton: HTMLButtonElement

	const webcamButton_onclick = async () => {
		localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
		remoteStream = new MediaStream();

		// Push tracks from local stream to peer connection
		localStream.getTracks().forEach((track) => {
			pc.addTrack(track, localStream);
		});

		// Pull tracks from remote stream, add to video stream
		pc.ontrack = (event) => {
			event.streams[0].getTracks().forEach((track) => {
				remoteStream.addTrack(track);
			});
		};

		webcamVideo.srcObject = localStream;
		remoteVideo.srcObject = remoteStream;

		callButton.disabled = false;
		answerButton.disabled = false;
		webcamButton.disabled = true;
	};

	server.onSessionDescriptionAdded((session) => {
		callButton.disabled = true;
		answerButton.disabled = false;
		webcamButton.disabled = false;

		callInput.value = props.roomID
	})

	// 2. Create an offer
	const callButton_onclick = async () => {

		callInput.value = props.roomID //callDoc.id; //need uuid for this call (use room id)

		// Get candidates for caller, save to db
		pc.onicecandidate = (event) => {
			event.candidate && server.addOfferCandidate(event.candidate)
		};

		// Create offer
		const offerDescription = await pc.createOffer();
		await pc.setLocalDescription(offerDescription);

		await server.setRoomSessionDescription({
			sdp: offerDescription.sdp,
			type: offerDescription.type,
		})

		// Listen for remote answer
		server.onRemoteAnswered((answer: RTCSessionDescription) => {
			console.log('onRemoteAnswered', answer)
			pc.setRemoteDescription(answer)
		})

		// When answered, add candidate to peer connection
		server.onAnswerCandidateAdded((candidate: RTCIceCandidate) => {
			console.log('onAnswerCandidateAdded', candidate)
			pc.addIceCandidate(candidate)
		})

		hangupButton.disabled = false;
	};

	// 3. Answer the call with the unique ID
	const answerButton_onclick = async () => {
		const callId = callInput.value;

		pc.onicecandidate = (event) => {
			event.candidate && server.addAnswerCandidate(event.candidate)
		};

		const offerDescription = await server.getRoomSessionDescription()
		await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

		const answerDescription = await pc.createAnswer();
		await pc.setLocalDescription(answerDescription);

		const answer: RTCSessionDescriptionInit = {
			type: answerDescription.type,
			sdp: answerDescription.sdp,
		};

		await server.sendAnswer(answer)

		server.onOfferCandidateAdded((candidate) => {
			console.log('onOfferCandidateAdded', candidate)
			pc.addIceCandidate(candidate);
		})
	};

	return <div class="call_container">
		<div class="videos">
			<video class="local" ref={webcamVideo} autoplay playsinline></video>
			<video class="remote" ref={remoteVideo} autoplay playsinline></video>
		</div>

		<button ref={webcamButton} onclick={webcamButton_onclick}>Start webcam</button>
		<button ref={callButton} disabled onclick={callButton_onclick}>Create Call (offer)</button>
		<input ref={callInput} />
		<button ref={answerButton} disabled onclick={answerButton_onclick}>Answer</button>
		<button ref={hangupButton} disabled>Hangup</button>
	</div>
}