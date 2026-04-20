# ⨳ tinyplanet chat 

This project is just me tinkering.\
Because learning and building is fun.\
All from scratch. No dependencies. No AI.\
Software is art. What do you think of AI art?

---

### The goal is...
People shouldn't just be items in a list! Explore a tiny 3D world where people are avatars and you need to get close to communicate. 

This is a virtual space with all the serious communication features of [Slack](https://slack.com/)\
...but more fun and **waaay** less convenient!

Inspired by [Gather](https://www.gather.town/features)

---

### Proof of concept:  https://tinyplanet.chat/   

![production deploy](https://github.com/dankoster/mux/actions/workflows/Droplet.yml/badge.svg)


#### POC features
- a tiny 3d planet!
- user avatar - drag the planet to move around
- multiple users all share the same planet
- proximity video call - get close to another avatar to start a call (try it from your phone and computer at the same time!)
- screen sharing - start a video call then hit the screen button
- github auth - click the login button
- domain name, linux server, database, etc.

---
### Up next
There's so much potential for building fun features! Own your own planet and build it out however you want. Travel to other planets, share files as 3d objects, e2e encrypted chat, push notifications, voice only calls, shared whiteboards, funny sounds, avatar customization, passkey integration. 

---
### Experimental stuff

Remember, I'm just tinkering here.

Sharing state in React between non-adjacent components is... annoying, at best. Props and contexts and reducers all make great sense from a unit testing perspective but fail to provide a good developer experience in all other cases. I still like the idea of JSX but the browser and plain JavaScript offer interesting and perhaps excellent solutions to the things that annoy me about React, and even SolidJS.

I am interested in answering the following questions in a way that is easy to use, easy to understand later, and easy to debug: 
- Can I just directly share state between different parts of a UI?
- Can I make an action like a button click in one part of the UI call a function waaaay over there on the other side of the UI in a totally different component? 

I just want stack traces that don't dissappear into the guts of some library. That's all.

JavaScript Module exports seem to solve a lot of the state sharing issues that libraries want to solve in over engineered ways. You may trade a little convenience but you get back a lot of simplicity. I like simplicity.

One thing I'm trying is module level `export let` functions. A singleton component can basically publish an API by exporting functions that are hooked up once the component is rendered. In the pseudocode example below, any other module can `import { addItem } from myComponent` and use that function to talk to the rendered component directly. Obviously you have to use state primitives within the component (signals in SolidJS, useState in React, etc) but the `export let` functions work great just because of how javascript modules work in the browser. You get actual stack traces and there's no unnecessary infrastructure.

Will this lead to a horriffic spaghetti mess? Maybe. But so can React's "clean code" approach. I'm going to shoot at my feet with this and see what happens. At least I'll get stack traces that are actually useful.

```javascript
//myComponent.js
function NotReady() { throw new Error('MyComponent not ready!') }
export let addItem = (item) => NotReady()

export MyComponent() {

	const items = []

	//replaces the exported module level function with this definition for all importers
	addItem = (item) => items.push(item)

	return <>use {items} here</>
}

```

---
### New-to-me learning for this project:
- [three.js](https://threejs.org/) (Check [this](https://dgreenheck.github.io/threejs-procedural-planets/) out!)
	- [simondev](https://www.youtube.com/watch?v=UuNPHOJ_V5o) third person camera
	- [poly.pizza](https://poly.pizza/) 3d models
- [webRTC](https://webrtc.org/) for peer-to-peer video calls, screen share, etc
- [server sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) and [websockets](https://websocket.org/guides/websocket-protocol/)
- [GitHub Oauth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) integration for user identity 
- [ECDH](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#ecdh)-[AES-GCM](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt#aes-gcm) for end-to-end encryption
- [SolidJS](https://www.solidjs.com/) for pretty lightweight JSX without React
- [Linux](https://commons.wikimedia.org/wiki/File:Linus_Torvalds.jpeg#/media/File:Linus_Torvalds.jpeg) and [Deno](https://deno.com/) for server stuff
- [SQLite](https://sqlite.org/) for database on the server
- [Digital Ocean](https://www.digitalocean.com/) for hosting


--- 


Mux? Naming things is hard. This repo started out on my laptop with the short but arbitrary name "mux", but that domain is taken. [tinyplanet.chat](https://tinyplanet.chat) is descriptive of what the project became and the domain was cheap, easy to say, and easy to spell correctly. 