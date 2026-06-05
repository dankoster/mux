
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import * as server from "./data/data"
import { displayName, shortId } from "./helpers";
import { PeerConnection } from "./PeerConnection";
import { GetSettingValue } from "./Settings";
import { MediaButton } from "./component/MediaButton";

import LocalMedia from "./LocalMedia";

import "./VideoCall.css"
import { uiLog } from "./uiLog";
import { Connection, SSEventPayload } from "../server/types";
import SmallChat from "./chat/SmallChat";
import { SvgIcon } from "./SvgIcon";

const peersById = new Map<string, PeerConnection>()

export const [micEnabled, setMicEnabled] = createSignal(false)
export const [camEnabled, setCamEnabled] = createSignal(false)
export const [screenEnabled, setScreenEnabled] = createSignal(false)
export const [maxVideoEnabled, setMaxVideoEnabled] = createSignal(false)
export const [isConnected, setIsConnected] = createSignal(false)

function NotReady<T=void>():T { throw new Error('<VideoCall /> not mounted') }
async function NotReadyAsync() { throw new Error('<VideoCall /> not mounted') }

export let toggleMic: (enabled?: boolean) => void = (enabled?: boolean) => NotReady()
export let toggleVideo: (enabled?: boolean) => void = (enabled?: boolean) => NotReady()
export let toggleMaxVideo: (enabled?: boolean) => void = (enabled?: boolean) => NotReady()
export let toggleScreenShare: () => void = () => NotReady()
export let Connect: (params: ConnectParams) => Promise<void> = (params: ConnectParams): Promise<void> => NotReadyAsync()
export let Disconnect: (conId: string) => Promise<void> = (conId: string): Promise<void> => NotReadyAsync()
export let HasPeer: (conId: string) => boolean = (conId: string) => NotReady<boolean>()

type ConnectParams = {
	conId: string,
	rtcConfig: RTCConfiguration,
	polite: boolean
}

export default function VideoCall() {
	let videoContainer: HTMLDivElement
	let localVideoContainer: HTMLDivElement
	// let observer: MutationObserver
	let localVideo: HTMLVideoElement
	let screenShareStream: MediaStream
	let config: RTCConfiguration

	const [peers, setPeers] = createSignal<PeerConnection[]>()
	const [outlineColor, setOutlineColor] = createSignal('')


	HasPeer = (conId: string) => peersById.has(conId);

	//both sides need to call this funciton
	// the callee is polite, the caller is not
	Connect = async ({ conId, rtcConfig, polite = true }: ConnectParams) => {
		config = rtcConfig
		polite = polite
		
		if (peersById.has(conId)) {
			console.trace(`Peer already conneced! ${conId}`)
			return //already connected?
		}

		console.log(`Connect ${conId} polite:${polite}`)

		const peer = new PeerConnection({
			conId,
			polite,
			config,
			onDisconnect: () => Disconnect(conId)
		})

		peersById.set(conId, peer)

		//add local audio/video stream, if any
		peer.addTracks(LocalMedia.stream)

		setPeers(Array.from(peersById.values()))
	}

	Disconnect = async (conId: string) => {
		const peer = peersById.get(conId)
		
		if (!peer) {
			console.warn(`Disconnect: conId already gone!  ${conId}`)
			return
		}

		console.log(`Disconnect ${conId}`)
		peer.endCall()
		peersById.delete(conId)

		setPeers(Array.from(peersById.values()))
	}

	toggleMaxVideo = (enabled?: boolean) => {
		if (enabled === undefined) enabled = maxVideoEnabled()

		setMaxVideoEnabled(!enabled)
	}

	toggleVideo = async (enabled?: boolean) => {
		if (enabled === undefined)
			enabled = !camEnabled()

		setCamEnabled(enabled)

		if (!enabled && LocalMedia.stream) {
			//remove video tracks from any connected peers
			peersById.forEach(peer => peer.removeTracks(LocalMedia.stream))
			LocalMedia.stopLocalStream()
			localVideo.srcObject = undefined
			setMicEnabled(false)
			return
		}

		const localStream = await LocalMedia.startLocalStream({ audio: true, video: true })
		LocalMedia.enableVideo(!GetSettingValue('Start Call Muted (video)'))
		LocalMedia.enableAudio(!GetSettingValue('Start Call Muted (audio)'))

		localVideo.srcObject = localStream

		watchVolumeLevel(localStream, volume => {
			const color = toColor(volume);
			setOutlineColor(color)
		})

		//TODO add video tracks to any connected peers
		peersById.forEach((peer, conId) => {
			uiLog(`Adding tracks for peer ${conId}`)
			peer.addTracks(localStream)
		})
	}

	toggleMic = (enabled?: boolean) => {
		if (!camEnabled()) return //TODO: add a nope bump animation

		if (enabled === undefined)
			enabled = !micEnabled()

		LocalMedia.enableAudio(enabled)
		setMicEnabled(enabled)
	}

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


	const onWebRtcMessage = (sse: SSEventPayload) => {
		// we got here because the other side is sending us RTC connection info
		const data = JSON.parse(sse.data);

		if (!peersById.has(data.senderId)) {
			console.warn(`got WebRtc message but have no peer for`, data.senderId)
			return
		}

		const rtcMessage = JSON.parse(data.message);
		console.log(data.senderId, rtcMessage)

		peersById.get(data.senderId)?.handleMessage(rtcMessage)
	}

	onMount(async () => {
		console.log("VideoCall.onMount")
		server.addServerSentEventHandler("webRTC", onWebRtcMessage)
	})

	onCleanup(() => {
		console.log("VideoCall.onCleanup")
		server.removeServerSentEventHandler("webRTC", onWebRtcMessage)
	})

	const myName = createMemo(() => {
		const self = server.self()
		return displayName(self)
	})

	const isAlone = createMemo(() => {
		const peerList = peers()
		const alone = Array.isArray(peerList) ? peerList.length === 0 : true
		setIsConnected(!alone)
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
						action={() => toggleMic()}
						enabledIcon="microphone"
						disabledIcon="microphone_muted"
					/>
					<MediaButton
						enabled={camEnabled}
						action={() => toggleVideo()}
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
	const [connection, setConnection] = createSignal<Connection>()

	onMount(() => {
		console.log('PeerConnectionMedia.onMount', props.peer.streams)

		setMediaStreams(Array.from(props.peer.streams))
		props.peer.addEventListener(PeerConnection.STREAMS_CHANGED, () => {
			console.log(PeerConnection.STREAMS_CHANGED, props.peer.streams)
			setMediaStreams(Array.from(props.peer.streams))
		})

		const con = server.connections.find(con => con.id === props.peer.conId)
		setConnection(con)
		setName((displayName(con) || shortId(props.peer?.conId)) ?? 'unknown')
	})

	onCleanup(() => {
		//TODO 
		console.log("PeerConnectionMedia.onCleanup")
	})

	return <div>
		<For each={mediaStreams()}>
			{stream => <PeerVideo name={name()} peer={props.peer} stream={stream} />}
		</For>
		<Show when={!mediaStreams() || mediaStreams()?.length == 0}>
			<div class="video-ui anon">
				<span class="name">{name()}</span>
				<SvgIcon icon="user" />
			</div>
		</Show>
		
		<SmallChat connection={connection()} />
	</div>
}

function PeerVideo(props: { name: string, peer: PeerConnection, stream: MediaStream }) {
	let videoElement: HTMLVideoElement

	const [remoteAudioEnabled, setRemoteAudioEnabled] = createSignal(true)
	const [outlineColor, setOutlineColor] = createSignal('')
	const [hasAudio, setHasAudio] = createSignal(false)

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
	})

	onCleanup(() => {
		//TODO
		console.log("PeerVideo.onCleanup")
	})

	return <div class="video-ui peer">
		<video id={props.peer.conId} style={{ "border-color": outlineColor() }} class="remote" ref={videoElement} autoplay playsinline />
		<span class="name">{props.name}</span>
		<Show when={hasAudio()}>
			<div class="buttons">
				<MediaButton
					enabled={remoteAudioEnabled}
					action={toggleRemoteAudioEnabled}
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
