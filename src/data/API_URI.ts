const {
	BASE_URL,
	DEV,
	MODE,
	PROD,
	SSR,
	VITE_API_URI, 
	VITE_SERVER_PORT, 
	//@ts-ignore
} = import.meta.env ?? {};

export const API_URI = (DEV ? location.origin.replace(location.port, VITE_SERVER_PORT ?? 8080) : "") + VITE_API_URI;

// console.log("VITE_SERVER_PORT", VITE_SERVER_PORT)
// console.log('API_URI', API_URI)
// //@ts-ignore
// console.log("env",import.meta.env)