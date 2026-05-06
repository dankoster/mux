import { createSignal, onCleanup, onMount, Show } from "solid-js";

import "./KeyBind.css"

export function CtrlKeyBind(props: { char: string, action: () => void }) {

	if (!props.char) return;

	const [ctrlDown, setCtrlDown] = createSignal(false)

	const onKeyUp = (e: KeyboardEvent) => {
		setCtrlDown(e.ctrlKey)
	}
	const onKeyDown = (e: KeyboardEvent) => {
		setCtrlDown(e.ctrlKey)
		if (e.ctrlKey && e.key === props.char) {
			props.action()
		}
	}

	onMount(() => {
		document.addEventListener('keyup', onKeyUp)
		document.addEventListener('keydown', onKeyDown)
	})
	onCleanup(() => {
		document.removeEventListener('keyup', onKeyUp)
		document.removeEventListener('keydown', onKeyDown)
	})

	return <>
		<Show when={ctrlDown()}>
			<span class="keybind outlined">{props.char}</span>
		</Show>
		<Show when={!ctrlDown()}>
			<div class="keybind outlined">ctrl</div>
		</Show>
	</>
}

export function KeyBind(props: { char: string, action: () => void }) {

	if (!props.char) return;

	const onKeyDown = (e: KeyboardEvent) => {
		//only handle presses that are not directed at a particular element
		if(e.key !== props.char || e.target !== document.body)
			return

		props.action()
	}

	onMount(() => {
		document.addEventListener('keydown', onKeyDown)
	})
	onCleanup(() => {
		document.removeEventListener('keydown', onKeyDown)
	})

	return <span class="keybind outlined">{props.char}</span>
}
