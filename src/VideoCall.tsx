
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import * as server from "./data/data"
import { displayName, shortId } from "./helpers";
import { PeerConnection } from "./PeerConnection";
import { GetSettingValue } from "./Settings";
import { onVisibilityChange } from "./onVisibilityChange";
import { MediaButton } from "./component/MediaButton";

import "./VideoCall.css"

const peersById = new Map<string, PeerConnection>()
let localStream: MediaStream
export const [micEnabled, setMicEnabled] = createSignal(false)
export const [camEnabled, setCamEnabled] = createSignal(false)
export const [screenEnabled, setScreenEnabled] = createSignal(false)
export const [maxVideoEnabled, setMaxVideoEnabled] = createSignal(false)


function NotReady() { throw new Error('<VideoCall /> not mounted') }

export let toggleMic: (enabled?: boolean) => void = (enabled?: boolean) => NotReady()
export let toggleVideo: (enabled?: boolean) => void = (enabled?: boolean) => NotReady()
export let toggleMaxVideo: (enabled?: boolean) => void = (enabled?: boolean) => NotReady()
export let toggleScreenShare: () => void = () => NotReady()
export let ConnectVideo: (conId: string, polite: boolean) => void = (conId: string, polite: boolean): void => NotReady()
export let DisconnectVideo: (conId: string) => void = (conId: string): void => NotReady()

export default function VideoCall() {
	let videoContainer: HTMLDivElement
	let localVideoContainer: HTMLDivElement
	let observer: MutationObserver
	let localVideo: HTMLVideoElement

	const [peers, setPeers] = createSignal<PeerConnection[]>()
	const [outlineColor, setOutlineColor] = createSignal('')

	//both sides need to call this funciton
	// the callee is polite, the caller is not
	ConnectVideo = async (conId: string, polite: boolean = true) => {
		console.log('ConnectVideo', conId, { polite })

		if (peersById.has(conId)) {
			console.warn(`Peer already conneced! ${conId}`)
			return //already connected?
		}

		const peer = new PeerConnection({
			conId,
			polite,
			onDisconnect: () => DisconnectVideo(conId)
		})

		peersById.set(conId, peer)

		if (!localStream) {
			await startLocalVideo()
		}

		//TODO: more robust startup settings
		//TODO: per-user exceptions
		//TODO: friend exceptions
		const startCamMuted = GetSettingValue('Start Call Muted (video)')
		const startMicMuted = GetSettingValue('Start Call Muted (audio)')
		if (startCamMuted) toggleVideo(!startCamMuted)
		if (startMicMuted) toggleMic(!startMicMuted)

		peer.addTracks(localStream)

		setPeers(Array.from(peersById.values()))
	}

	DisconnectVideo = (conId: string) => {
		const peer = peersById.get(conId)

		if (!peer) {
			console.warn(`DisconnectVideo: conId already gone! ${conId}`)
			return
		}

		console.log('DisconnectVideo', conId)
		peer.endCall()
		peersById.delete(conId)

		setPeers(Array.from(peersById.values()))
	}

	toggleMaxVideo = (enabled?: boolean) => {
		if (enabled === undefined) enabled = maxVideoEnabled()

		setMaxVideoEnabled(!enabled)
	}

	toggleVideo = (enabled?: boolean) => {
		if (enabled === undefined)
			enabled = !camEnabled()
		try {
			localStream.getVideoTracks().forEach(track => track.enabled = enabled)
			setCamEnabled(enabled)
		} catch (error) {
			if (error.name === 'TypeError' && error.message.startsWith('Cannot read properties of undefined')) {
				console.warn(error)
				startLocalVideo()
			}
			else throw error
		}
	}

	toggleMic = (enabled?: boolean) => {
		if (enabled === undefined)
			enabled = !micEnabled()
		try {
			localStream.getAudioTracks().forEach(track => track.enabled = enabled)
			setMicEnabled(enabled)
		} catch (error) {
			if (error.name === 'TypeError' && error.message.startsWith('Cannot read properties of undefined')) {
				console.log('no local stream')
			}
			else throw error
		}
	}

	let screenShareStream: MediaStream

	toggleScreenShare = async () => {
		const enabled = !screenEnabled()
		
		//TODO: handle new connections that come in later

		if (enabled) {
			screenShareStream = await navigator.mediaDevices.getDisplayMedia({ video: true })			
			peersById.forEach(peer => peer.addTracks(screenShareStream))
		}
		else {
			screenShareStream.getTracks().forEach(track => track.stop())
			peersById.forEach(peer => peer.removeTracks(screenShareStream))
		}

		setScreenEnabled(enabled)
	}

	async function startLocalVideo() {
		localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

		localVideo.srcObject = localStream;
		localVideo.muted = true;

		const startCamMuted = GetSettingValue('Start Call Muted (video)')
		const startMicMuted = GetSettingValue('Start Call Muted (audio)')

		// console.log('startLocalVideo', { startCamMuted, startMicMuted })
		// localStream.getTracks().map((t) => console.log(t.getCapabilities()));

		toggleVideo(!startCamMuted)
		toggleMic(!startMicMuted)

		watchVolumeLevel(localStream, volume => {
			const color = toColor(volume);
			setOutlineColor(color)
		})
	}

	onMount(async () => {

		server.onWebRtcMessage((message) => {
			if (!peersById.has(message.senderId)) {
				ConnectVideo(message.senderId, false)
			}

			peersById.get(message.senderId)?.handleMessage(JSON.parse(message.message))
		})

		const startVideoOnLoad = GetSettingValue('Start video on load')
		if (startVideoOnLoad) {
			startLocalVideo()
		}

		//BUG: something weird here on Chrome
		let savedMuteState: { micEnabled: boolean; camEnabled: boolean; }
		onVisibilityChange(visible => {
			const shouldMute = GetSettingValue('Mute when focus is lost')
			const shouldUnMute = GetSettingValue('Restore mute state when refocused')
			if (!visible && shouldMute) {
				savedMuteState = {
					micEnabled: micEnabled(),
					camEnabled: camEnabled()
				}
				console.log('save state', savedMuteState)
				toggleVideo(false)
				toggleMic(false)
			}
			if (visible && shouldUnMute && savedMuteState) {
				console.log('restore state', savedMuteState)
				toggleMic(savedMuteState.micEnabled)
				toggleVideo(savedMuteState.camEnabled)
			}
		});
	})

	onCleanup(() => {
		peersById.forEach(peer => peer.endCall())
		peersById.clear();
		observer?.disconnect()
	})

	const myName = createMemo(() => {
		const self = server.self()
		return displayName(self)
	})

	const isAlone = createMemo(() => {
		const peerList = peers()
		const alone = Array.isArray(peerList) ? peerList.length === 0 : true
		return alone
	})

	return <div id="videos-container" class="video-call" classList={{ 'max-video': maxVideoEnabled() }} ref={videoContainer}>
		<div class="video-ui local" classList={{ alone: isAlone() }} ref={localVideoContainer}>
			<video id="local-video" ref={localVideo} style={{ "border-color": outlineColor() }} autoplay playsinline />
			<span class="name">{myName()}</span>
			<Show when={!isAlone()}>

				<div class="buttons">
					<MediaButton
						enabled={micEnabled}
						onClick={() => toggleMic()}
						enabledIcon="microphone"
						disabledIcon="microphone_muted"
					/>
					<MediaButton
						enabled={camEnabled}
						onClick={() => toggleVideo()}
						enabledIcon="camera"
						disabledIcon="camera_muted"
					/>
				</div>
			</Show>
		</div>

		<For each={peers()}>
			{(peer) => <PeerConnectionMedia peer={peer} />}
		</For>
	</div>
}

function PeerConnectionMedia(props: { peer: PeerConnection }) {

	const [mediaStreams, setMediaStreams] = createSignal<readonly MediaStream[]>([])
	const [name, setName] = createSignal('')

	onMount(() => {
		console.log('PeerConnectionMedia.onMount', props.peer.streams)

		setMediaStreams(Array.from(props.peer.streams))
		props.peer.addEventListener('PeerConnection:StreamsChanged', () => {
			console.log('PeerConnection:StreamsChanged', props.peer.streams)
			setMediaStreams(Array.from(props.peer.streams))
		})


		const con = server.connections.find(con => con.id === props.peer.conId)
		setName(displayName(con) || shortId(props.peer.conId))
	})

	return <For each={mediaStreams()}>
		{stream => <PeerVideo name={name()} peer={props.peer} stream={stream} />}
	</For>
}

function PeerVideo(props: { name: string, peer: PeerConnection, stream: MediaStream }) {
	let videoElement: HTMLVideoElement

	const [remoteAudioEnabled, setRemoteAudioEnabled] = createSignal(true)
	const [outlineColor, setOutlineColor] = createSignal('')
	const [hasAudio, setHasAudio] = createSignal(false)


	const toggleTrackKindMutedClass = (track: MediaStreamTrack) => {
		videoElement.classList.toggle(`${track.kind}-muted`, track.muted)
	}

	const toggleRemoteAudioEnabled = () => {
		const enabled = !remoteAudioEnabled()
		setRemoteAudioEnabled(enabled)
		props.peer.enableRemoteAudio(enabled)
	}

	onMount(() => {
		videoElement.srcObject = props.stream

		const audioTracks = props.stream.getAudioTracks()

		if (audioTracks?.length > 0) {
			setHasAudio(true)
			watchVolumeLevel(props.stream, volume => {
				const color = toColor(volume)
				setOutlineColor(color)
			})
		}

		props.stream.getTracks().forEach(track => {
			track.addEventListener('mute', () => toggleTrackKindMutedClass(track))
			track.addEventListener('unmute', () => toggleTrackKindMutedClass(track))
			toggleTrackKindMutedClass(track)
		})
	})

	return <div class="video-ui peer">
		<video id={props.peer.conId} style={{ "border-color": outlineColor() }} class="remote" ref={videoElement} autoplay playsinline />
		<span class="name">{props.name}</span>
		<Show when={hasAudio()}>
			<div class="buttons">
				<MediaButton
					enabled={remoteAudioEnabled}
					onClick={toggleRemoteAudioEnabled}
					enabledIcon="unmute"
					disabledIcon="mute"
				/>
			</div>
		</Show>
	</div>
}


function toColor(volume: number) {
	const amplify = 3
	const opacity = Math.min(Math.round(volume * amplify), 0xff).toString(16);
	const color = `#f9ff00${opacity}`;
	return color;
}

async function watchVolumeLevel(mediaStream: MediaStream, callback: (volume: number) => void) {
	const audioContext = new AudioContext();
	const analyser = audioContext.createAnalyser();

	//Must be a power of 2 between 2^5 and 2^15
	//A higher value will result in more details in the frequency domain but fewer details in the amplitude domain.
	analyser.fftSize = 32

	try {
		const streamSource = audioContext.createMediaStreamSource(mediaStream)
		streamSource.connect(analyser)

		const dataArray = new Uint8Array(analyser.frequencyBinCount);
		function caclculateVolume() {
			analyser.getByteFrequencyData(dataArray)

			let sum = 0;
			for (const amplitude of dataArray) {
				sum += amplitude * amplitude
			}

			const volume = Math.sqrt(sum / dataArray.length)
			callback(volume)

			if (mediaStream.active)
				requestAnimationFrame(caclculateVolume)
		}

		caclculateVolume()

	} catch (error) {
		console.error(error)
	}
}
