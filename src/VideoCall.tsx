
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import * as server from "./data/data"
import { displayName, shortId } from "./helpers";
import { PeerConnection } from "./PeerConnection";
import { GetSettingValue, ShowSettings } from "./Settings";
import { onVisibilityChange } from "./onVisibilityChange";
import { MediaButton } from "./component/MediaButton";
import { FigmentMenu, MenuItem } from "./Menu";

import "./VideoCall.css"

const peersById = new Map<string, PeerConnection>()
let localStream: MediaStream
const [micEnabled, setMicEnabled] = createSignal(false)
const [camEnabled, setCamEnabled] = createSignal(false)
const [screenEnabled, setScreenEnabled] = createSignal(false)
const [maxVideoEnabled, setMaxVideoEnabled] = createSignal(false)


function NotReady() { throw new Error('<VideoCall /> not mounted') }

let toggleMic: (enabled?: boolean) => void = (enabled?: boolean) => NotReady()
let toggleVideo: (enabled?: boolean) => void = (enabled?: boolean) => NotReady()
let toggleMaxVideo: (enabled?: boolean) => void = (enabled?: boolean) => NotReady()
let toggleScreenShare: () => void = () => NotReady()
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
		if(enabled === undefined) enabled = maxVideoEnabled()

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

	toggleScreenShare = () => {
		const enabled = !screenEnabled()
		setScreenEnabled(enabled)

		if (enabled) {
			//TODO: add video element
			const options = { audio: true, video: true };
			navigator.mediaDevices.getDisplayMedia(options).then(
				stream => {
					console.log('toggleScreenShare', stream)
					//share stream with peer connection
					peersById.forEach(peer => peer.addTracks(stream))

					//TODO: display stream preview thumbnail?
				},
				error => console.error(error)
			)
		}
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
		console.log('VideoCall CLEANUP')
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

	return <div id="videos-container" class="video-call" classList={{'max-video': maxVideoEnabled()}} ref={videoContainer}>
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
			{(peer) => <PeerVideo peer={peer} />}
		</For>
	</div>
}

function PeerVideo(props: { peer: PeerConnection }) {
	let videoElement: HTMLVideoElement
	let containerElement: HTMLDivElement

	const handleMuteEvent = (track: MediaStreamTrack) => {
		videoElement.classList.toggle(`${track.kind}-muted`, track.muted)
	}

	const [name, setName] = createSignal('')
	const [soundEnabled, setSoundEnabled] = createSignal(true)
	const [outlineColor, setOutlineColor] = createSignal('')

	const toggleSoundEnabled = () => {
		const enabled = !soundEnabled()
		setSoundEnabled(enabled)
		props.peer.enableAudio(enabled)
	}

	onMount(() => {
		const con = server.connections.find(con => con.id === props.peer.conId)
		setName(displayName(con) || shortId(props.peer.conId))

		//TODO: generate a video element for each video stream. 
		// 

		// console.log('mounted!', videoElement, props.peer.remoteStream)
		// props.peer.remoteStream.addEventListener('addtrack', (ev) => console.log('PeerVideo.addTrack', ev))
		// props.peer.remoteStream.addEventListener('removetrack', (ev) => console.log('PeerVideo.removetrack', ev))
		videoElement.srcObject = props.peer.remoteStream

		props.peer.addEventListener('track', (e: CustomEvent<MediaStreamTrack>) => {
			const track = e.detail

			track.addEventListener('mute', () => handleMuteEvent(track))
			track.addEventListener('unmute', () => handleMuteEvent(track))
			handleMuteEvent(track)

			if (track.kind === 'audio') {
				watchVolumeLevel(props.peer.remoteStream, volume => {
					const color = toColor(volume)
					setOutlineColor(color)
				})
			}
		})
	})

	return <div class="video-ui peer" ref={containerElement}>
		<video id={props.peer.conId} style={{ "border-color": outlineColor() }} class="remote" ref={videoElement} autoplay playsinline />
		<span class="name">{name()}</span>
		<div class="buttons">
			<MediaButton
				enabled={soundEnabled}
				onClick={toggleSoundEnabled}
				enabledIcon="unmute"
				disabledIcon="mute"
			/>
		</div>
	</div>
}


export function VideoCallToolbar() {
	const userClicked = (e: MouseEvent) => {
		menu.Clear()
		menu.AddItem(new MenuItem({
			text: `Chat`,
			subtext: 'coming soon...'
		}))
		menu.AddItem(new MenuItem({
			text: `Map`,
			subtext: 'coming soon...'
		}))
		menu.AddItem(new MenuItem({
			text: `Build`,
			subtext: 'coming soon...'
		}))
		menu.AddItem(new MenuItem({
			text: `Share`,
			subtext: 'coming soon...'
		}))
		menu.AddItem(new MenuItem({
			text: `Find`,
			subtext: 'coming soon...'
		}))

		menu.AddSeparator()
		menu.AddItem(new MenuItem({
			text: `Settings`,
			onTextClick: () => {
				ShowSettings()
				menu.Clear()
			}
		}))
		menu.AddSeparator()
		menu.AddItem(new MenuItem({
			text: `Logout ${server.self().identity.name}`,
			onTextClick: () => server.becomeAnonymous(),
		}))
		menu.ShowFor((e.target as HTMLElement).parentElement)
	}

	let menu: FigmentMenu
	onMount(() => {
		menu = new FigmentMenu()
	})

	return <div class="avatar button">
		<img alt={server.self()?.identity?.name} src={server.self()?.identity.avatar_url} onclick={userClicked} />
		<div class="name" onclick={userClicked}>{server.self()?.identity.name}</div>

		<MediaButton
			className="audio"
			enabled={micEnabled}
			onClick={() => toggleMic()}
			enabledIcon="microphone"
			disabledIcon="microphone_muted"
		/>
		<MediaButton
			className="video"
			enabled={camEnabled}
			onClick={() => toggleVideo()}
			enabledIcon="camera"
			disabledIcon="camera_muted"
		/>
		<MediaButton
			className="max-video"
			enabled={maxVideoEnabled}
			onClick={() => toggleMaxVideo()}
			enabledIcon="users"
			disabledIcon="users_rays"
		/>
		{/* <div class={`screen`} onclick={toggleScreenShare}>
			<SvgIcon icon={'share_screen'} />
		</div> */}
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
}
