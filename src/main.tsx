import "./index.css"
import "./main.css"

import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import server from "./data";
import { Connection } from "../server/api";

const ConnectionPanel = (props: { connection: Connection, showColorPicker: boolean }) => {
	const c = props.connection;
	const [color, setColor] = createSignal(c.color)

	return <div id={`${c.id}`} class="connection" style={{ "background-color": color() }}>
		{props.showColorPicker && <input
			type="color"
			oninput={(e) => setColor(e.target.value)}
			onchange={(e) => server.setColor(e.target.value)}
			value={color()} />}
	</div>
}

const App = () => {
	return <>
		<div class="connections">
			{server.connections().map(c => <ConnectionPanel connection={c} showColorPicker={c.id == server.id()} />)}
		</div>
	</>;
};

render(() => <App />, document.getElementById("root"));
