import {
	Application,
	Middleware,
	Router,
} from "jsr:@oak/oak@17";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { api } from "./api.ts";

//@ts-ignore
const PORT = import.meta.env?.VITE_SERVER_PORT ?? 8080;

const logRouteDuration: Middleware = async (ctx, next) => {
	const start = Date.now();
	await next();
	const end = Date.now();
	const duration = end - start;
	console.log('[TIME]', `${duration}ms ${ctx.request.method}\t${ctx.request.url}`);
};

const router = new Router();

router.use('/api', api.routes())
router.use(api.allowedMethods());

const origins = [
	"localhost"
]

const app = new Application();
// app.use(logRouteDuration);
app.use(oakCors())
// app.use(oakCors({
// 	origin: async (requestOrigin) => {
// 		if(requestOrigin == null) 
// 			return false

// 		const url = URL.parse(requestOrigin)
// 		if(url == null)
// 			return false

// 		return origins.includes(url.hostname)
// 	  },
// })); // Enable CORS for All Routes
app.use(router.routes());

//serve static files from /dist
app.use(async (context, next) => {
	try {
		await context.send({
			root: "./dist",
			index: "index.html",
		});
	} catch (error) {
		console.error("[STATIC]", context.request.url.toString(), error)
	}
});

app.use(router.allowedMethods());

app.addEventListener("listen", ({ hostname, port, secure }) => {
	const origin = `${secure ? "https://" : "http://"}${hostname ?? "localhost"}`
	console.log(
		`Listening on: ${origin}:${port}`,
	);
});

await app.listen({ port: PORT });

