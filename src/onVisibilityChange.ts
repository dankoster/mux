import { trace } from "./trace";

export function onVisibilityChange(callback: (visible: boolean) => void) {
	let visible: boolean;
	let timeout: number;

	function focused(value: boolean) {
		if (visible != value) {
			visible = value

			// trace('--- focused', visible)

			//debounce the callback because we may have multiple events fire
			// for example when the tab is visible but the window is not focused
			// you can click a different tab which will focust the window then blur
			// to the selected tab.
			clearTimeout(timeout)
			timeout = window.setTimeout(() => {
				callback(visible);
			}, 100);
		}
	}

	// Standards:
	if ('hidden' in document) {
		focused(!document.hidden)
		document.addEventListener('visibilitychange',
			() => focused(!document.hidden))
	}
	if ('mozHidden' in document) {
		focused(!document.mozHidden)
		document.addEventListener('mozvisibilitychange',
			//@ts-expect-error
			() => focused(!document.mozHidden))
	}
	if ('webkitHidden' in document) {
		focused(!document.webkitHidden)
		document.addEventListener('webkitvisibilitychange',
			//@ts-expect-error
			() => focused(!document.webkitHidden))
	}
	if ('msHidden' in document) {
		focused(!document.msHidden)
		document.addEventListener('msvisibilitychange',
			//@ts-expect-error
			() => focused(!document.msHidden))
	}
	// IE 9 and lower:
	if ('onfocusin' in document) {
		document.onfocusin = () => { focused(true); }
		//@ts-expect-error
		document.onfocusout = () => { focused(false); }
	}

	// All others:
	window.onpageshow = () => { focused(true); }
	window.onpagehide = () => { focused(false); }
	window.onfocus = () => { focused(true); }
	window.onblur = () => { focused(false); }
};