import "./index.css"
import "./main.css"

import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import server from "./data";
import { Connection } from "../server/api";

const ConnectionPanel = (props: { connection: Connection, showControls: boolean }) => {

	const [color, setColor] = createSignal(props.connection.color)
	const [text, setText] = createSignal(props.connection.text)

	// let ref: HTMLInputElement

	// onMount(() => {
	// 	ref?.focus()
	// })

	return <div
		class="connection"
		classList={{ "controls": props.showControls }}
		style={{ "background-color": color() }}>
		{!props.showControls && <>
			<h2>{props.connection.status === "online" ? text() ?? "🌈 🤔" : "😴"}</h2>
		</>}
		{props.showControls && <>
			<input
				type="text"
				// ref={ref}
				placeholder="Say hello! 👋 Set a color 👉"
				oninput={(e) => setText(e.target.value)}
				onchange={(e) => server.setText(e.target.value)}
				onfocus={(e) => e.target.setSelectionRange(0, e.target.value.length)}
				value={text() ?? ''} />
			<input
				type="color"
				oninput={(e) => setColor(e.target.value)}
				onchange={(e) => server.setColor(e.target.value)}
				value={color()} />
		</>}
	</div>
}

const App = () => {
	return <>
		<Show when={!server.serverOnline()}>
			<div>Server OFFLINE</div>
		</Show>
		<Show when={server.serverOnline()}>
			<div class="connections">
				{server.connections().map(c => <ConnectionPanel connection={c} showControls={c.id == server.id()} />)}
			</div>
		</Show>
	</>
};

render(() => <App />, document.getElementById("root"));
