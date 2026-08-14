<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import CarbonClose from "~icons/carbon/close";
	import CarbonCheckmark from "~icons/carbon/checkmark";
	import IconArrowUp from "~icons/lucide/arrow-up";
	import EosIconsLoading from "~icons/eos-icons/loading";
	import IconLoading from "$lib/components/icons/IconLoading.svelte";
	import AudioWaveform from "$lib/components/voice/AudioWaveform.svelte";

	interface Props {
		isTranscribing: boolean;
		isTouchDevice: boolean;
		oncancel: () => void;
		onconfirm: (audioBlob: Blob) => void;
		onsend: (audioBlob: Blob) => void;
		onerror: (message: string) => void;
	}

	let { isTranscribing, isTouchDevice, oncancel, onconfirm, onsend, onerror }: Props = $props();

	let mediaRecorder: MediaRecorder | null = $state(null);
	let audioChunks: Blob[] = $state([]);
	let analyser: AnalyserNode | null = $state(null);
	let frequencyData: Uint8Array = $state(new Uint8Array(32));
	let animationFrameId: number | null = $state(null);
	let audioContext: AudioContext | null = $state(null);
	let mediaStream: MediaStream | null = $state(null);

	function startVisualization() {
		function update() {
			if (analyser) {
				const data = new Uint8Array(analyser.frequencyBinCount);
				analyser.getByteFrequencyData(data);
				// Create new array to trigger Svelte reactivity
				frequencyData = data;
			}
			animationFrameId = requestAnimationFrame(update);
		}
		update();
	}

	function stopVisualization() {
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
	}

	async function startRecording() {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					channelCount: 1,
					sampleRate: 16000, // Whisper prefers 16kHz
					echoCancellation: true,
					noiseSuppression: true,
				},
			});

			mediaStream = stream;

			// Set up audio context for visualization
			audioContext = new AudioContext();
			const source = audioContext.createMediaStreamSource(stream);
			analyser = audioContext.createAnalyser();
			analyser.fftSize = 64; // Small for performance, gives 32 frequency bins
			analyser.smoothingTimeConstant = 0.4;
			source.connect(analyser);
			frequencyData = new Uint8Array(analyser.frequencyBinCount);

			// Start MediaRecorder
			// Use webm/opus for broad browser support
			const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
				? "audio/webm;codecs=opus"
				: "audio/webm";

			mediaRecorder = new MediaRecorder(stream, { mimeType });
			audioChunks = [];

			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) {
					audioChunks = [...audioChunks, e.data];
				}
			};

			mediaRecorder.start(100); // Collect data every 100ms
			startVisualization();
		} catch (err) {
			if (err instanceof DOMException) {
				if (err.name === "NotAllowedError") {
					onerror("Microphone access denied. Please allow in browser settings.");
				} else if (err.name === "NotFoundError") {
					onerror("No microphone found.");
				} else {
					onerror(`Microphone error: ${err.message}`);
				}
			} else {
				onerror("Could not access microphone.");
			}
		}
	}

	function stopRecording(): Promise<Blob | null> {
		return new Promise((resolve) => {
			stopVisualization();

			// Stop all audio tracks
			if (mediaStream) {
				mediaStream.getTracks().forEach((track) => track.stop());
				mediaStream = null;
			}

			// Close audio context
			if (audioContext) {
				audioContext.close();
				audioContext = null;
			}
			analyser = null;

			if (!mediaRecorder || mediaRecorder.state === "inactive") {
				mediaRecorder = null;
				resolve(
					audioChunks.length > 0
						? new Blob(audioChunks, { type: audioChunks[0]?.type || "audio/webm" })
						: null
				);
				return;
			}

			// Wait for final data before resolving
			mediaRecorder.onstop = () => {
				const mimeType = audioChunks[0]?.type || "audio/webm";
				const blob = audioChunks.length > 0 ? new Blob(audioChunks, { type: mimeType }) : null;
				mediaRecorder = null;
				resolve(blob);
			};

			mediaRecorder.stop();
		});
	}

	async function handleCancel() {
		await stopRecording();
		oncancel();
	}

	async function handleConfirm() {
		const audioBlob = await stopRecording();
		if (audioBlob && audioBlob.size > 0) {
			if (isTouchDevice) {
				onsend(audioBlob);
			} else {
				onconfirm(audioBlob);
			}
		} else {
			onerror("No audio recorded. Please try again.");
		}
	}

	onMount(() => {
		startRecording();
	});

	onDestroy(() => {
		// Fire and forget - cleanup happens but we don't wait
		stopRecording();
	});
</script>

<div class="flex h-full w-full items-center justify-between px-3 py-1.5">
	<!-- Cancel button -->
	<button
		type="button"
		class="btn grid size-8 place-items-center rounded-full border bg-white text-black shadow transition-none hover:bg-gray-100 dark:border-transparent dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500 sm:size-7"
		onclick={handleCancel}
		aria-label="Cancel recording"
	>
		<CarbonClose class="size-4" />
	</button>

	<!-- Waveform / Loading -->
	<div class="flex h-12 flex-1 items-center overflow-hidden pl-2.5 pr-1.5">
		{#if isTranscribing}
			<div class="flex h-full w-full items-center justify-center">
				<IconLoading classNames="text-gray-400" />
			</div>
		{:else}
			<AudioWaveform {frequencyData} minHeight={4} maxHeight={40} />
		{/if}
	</div>

	<!-- Confirm/Send button -->
	<button
		type="button"
		class="btn grid size-8 place-items-center rounded-full border shadow transition-none disabled:opacity-50 sm:size-7 {isTouchDevice
			? 'border-transparent bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200'
			: 'bg-white text-black hover:bg-gray-100 dark:border-transparent dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500'}"
		onclick={handleConfirm}
		disabled={isTranscribing}
		aria-label={isTranscribing
			? "Transcribing..."
			: isTouchDevice
				? "Send message"
				: "Confirm and transcribe"}
	>
		{#if isTranscribing}
			<EosIconsLoading class="size-4" />
		{:else if isTouchDevice}
			<IconArrowUp class="size-4" />
		{:else}
			<CarbonCheckmark class="size-4" />
		{/if}
	</button>
</div>
