import { onMount } from "solid-js";
import { Connection } from "../server/api";
import server from "./data";

export const ConnectionPanel = (props: { connection: Connection; showControls: boolean; }) => {

	let ref: HTMLInputElement;

	onMount(() => {
		ref?.focus();
	});

	return <div
		class="connection controls"
		// classList={{ "controls": props.showControls }}
		style={{ "background-color": props.connection.color }}>
		{!props.showControls && <>
			<h2 textContent={props.connection.text || "🌈 🤔"}></h2>
			<h2>{props.connection.status === "online" ? "👀" : "😴"}</h2>
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
				oninput={(e) => e.target.parentElement.style.backgroundColor = e.target.value}
				onchange={(e) => server.setColor(e.target.value)}
				value={props.connection.color} />
		</>}
	</div>;
};
