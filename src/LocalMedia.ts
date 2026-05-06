
let localMediaStream: MediaStream

export default {
	
	async startLocalStream({ audio = true, video = true }:{ audio: boolean, video: boolean}) {
		if(!localMediaStream){
			const start = Date.now()
			localMediaStream = await navigator.mediaDevices.getUserMedia({ audio, video });
			const duration = Date.now() - start;
			console.log(`getUserMedia in ${duration}ms`)
		}
		return localMediaStream
	},

	stopLocalStream() {
		const tracks = localMediaStream?.getTracks()
		tracks?.forEach(track => track.stop())
		localMediaStream = null
	},

	get stream() {
		return localMediaStream
	},

	async enableVideo(enabled: boolean) {
		localMediaStream.getVideoTracks().forEach(track => track.enabled = enabled)
	},

	async enableAudio(enabled: boolean) {
		localMediaStream.getAudioTracks().forEach(track => track.enabled = enabled)
	}
}
