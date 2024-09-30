import "./index.css"
import "./main.css"

import { createSignal, For, onMount, Show } from "solid-js";
import { render } from "solid-js/web";
import server from "./data";
import { Connection } from "../server/api";

const ConnectionPanel = (props: { connection: Connection, showControls: boolean }) => {

	let ref: HTMLInputElement

	onMount(() => {
		ref?.focus()
	})

	return <div
		class="connection controls"
		// classList={{ "controls": props.showControls }}
		style={{ "background-color": props.connection.color }}>
		{!props.showControls && <>
			<h2 textContent={props.connection.text || "🌈 🤔"}></h2>
			<h2>{props.connection.status === "online" ? "👀" : `😴`}</h2>
		</>}
		{props.showControls && <>
			<input
				ref={ref}
				type="text"
				maxlength="123"
				placeholder="Leave a message! 👋 🌈 👉"
				onchange={(e) => server.setText(e.target.value)}
				onfocus={(e) => e.target.setSelectionRange(0, e.target.value.length)}
				value={props.connection.text ?? ''} />
			<input
				type="color"
				onchange={(e) => server.setColor(e.target.value)}
				value={props.connection.color} />
		</>}
	</div>
}

const App = () => {
	return <>
		<Show when={!server.serverOnline()}>
			<div class="offlineMessage">connecting...</div>
		</Show>
		<Show when={server.serverOnline()}>
			<div class="header">
				<h1 class="logo">⨳ MUX</h1>
				<div class="stats">
					<div class="userCount"><b>{server.stats()?.online ?? "?"}</b> online 👀</div>
					<div class="userCount"><b>{server.stats()?.offline ?? "?"}</b> offline 😴</div>
				</div>
			</div>
			<div class="connections">
				<For each={server.connections}>
					{(con)=><ConnectionPanel connection={con} showControls={con.id == server.id()} />}
				</For>
			</div>
		</Show>
	</>
};

render(() => <App />, document.getElementById("root"));
