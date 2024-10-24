import { Router } from "jsr:@oak/oak@17/router";
import { addConnectionIdentity, validateConnectionByUUID } from "./api.ts";

export { github }

const github = new Router();

//https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#web-application-flow
github.get(`/oauth`, async (context) => {

	//github has authenticated the user and redirected them here with a code and state
	const reqURL = context.request.url
	const code = reqURL.searchParams.get('code')
	const uuid = reqURL.searchParams.get('state')

	//now we need to use the state to verify this user exists on our end
	const hasValidConnection = uuid && validateConnectionByUUID(uuid)
	console.log('GITHUB OAUTH CALLBACK', { code, uuid, hasValidConnection })
	if (!code || !uuid || !hasValidConnection) {
		context.response.status = 400 //bad request
		return
	}

	//next, use the code to request the user's github info
	//POST https://github.com/login/oauth/access_token
	const client_id = Deno.env.get("VITE_GITHUB_OAUTH_CLIENT_ID")
	const client_secret = Deno.env.get("GITHUB_OAUTH_CLIENT_SECRET")
	const redirect_uri = Deno.env.get("VITE_GITHUB_OAUTH_REDIRECT_URI")

	if (!client_id) throw new Error("ENV MISSING: VITE_GITHUB_OAUTH_CLIENT_ID")
	if (!client_secret) throw new Error("ENV MISSING: GITHUB_OAUTH_CLIENT_SECRET")
	if (!redirect_uri) throw new Error("ENV MISSING: VITE_GITHUB_OAUTH_REDIRECT_URI")

	const authUrl = new URL("https://github.com/login/oauth/access_token")
	authUrl.searchParams.append('client_id', client_id)
	authUrl.searchParams.append('client_secret', client_secret)
	authUrl.searchParams.append('code', code)
	authUrl.searchParams.append('redirect_uri', redirect_uri)

	const authResponse = await fetch(authUrl, {
		method: "POST",
		headers: { Accept: 'application/json' }
	})

	const authJson = await authResponse.json()
	console.log("GITHUB AUTH RESPONSE", authJson)

	// Accept: application/json
	// {
	// 	"access_token":"gho_16C7e42F292c6912E7710c838347Ae178B4a",
	// 	"scope":"repo,gist",
	// 	"token_type":"bearer"
	// }

	const {access_token} = authJson

	if(!access_token) throw new Error("access_token missing from github response json")

	//get the user's info from the github api
	//https://docs.github.com/en/rest/users/users?apiVersion=2022-11-28
	const url = new URL("https://api.github.com/user")
	const result = await fetch(url, {
		method: "GET",
		headers: { 
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${access_token}`,
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	const json = await result.json()
	console.log("GITHUB USER RESPONSE", json)

	const { id, name, avatar_url } = json

	addConnectionIdentity(uuid, { source: 'github', id, name, avatar_url })
	console.log('GITHUB AUTH SUCCESS', hasValidConnection)

	context.response.redirect('/')
});
