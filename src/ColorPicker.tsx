import * as server from "./data/data";

function ColorPicker() {
	return <div class="color-picker">
		<input
			class="color-input"
			type="color"
			oninput={(e) => e.target.parentElement.style.backgroundColor = e.target.value}
			onchange={(e) => server.setColor(e.target.value)}
			value={server.self()?.color ?? 'transparent'} />
	</div>;
}
