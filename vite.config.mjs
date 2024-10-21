import { defineConfig } from "npm:vite@^5.4.9"
import solidPlugin from "npm:vite-plugin-solid@^2.3.0"

import "npm:solid-js@^1.8.23";
import "solid-js";
import "solid-js/web";
import "solid-primitives/deep";

export default defineConfig({
  plugins: [solidPlugin()],
})