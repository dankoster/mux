import "./index.css"
import "./main.css"

import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import server from "./data";
import { Connection } from "../server/api";

const ConnectionPanel = (props: { connection: Connection, showControls: boolean }) => {
	const c = props.connection;
	const [color, setColor] = createSignal(c.color)
	const [text, setText] = createSignal(c.text)

	return <div
		class="connection"
		classList={{ "controls": props.showControls }}
		style={{ "background-color": color() }}>
		{!props.showControls && <h2>{text() ?? "🌈 🤔"}</h2>}
		{props.showControls && <>
			<input
				type="text"
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
		<div class="connections">
			{server.connections().map(c => <ConnectionPanel connection={c} showControls={c.id == server.id()} />)}
		</div>
	</>;
};

render(() => <App />, document.getElementById("root"));
