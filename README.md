# ⨳ tinyplanet chat 

This project is just me tinkering.\
Because learning and building is fun.\
All from scratch. No dependencies. No AI.\
Software is art. What do you think of AI art?

---

### The goal is...
A virtual space with all the serious communication features of [Slack](https://slack.com/)...\
But **way** less convenient! \
And a **lot** more fun!

Instead of a boring flat UI where people are just items in a list, explore a 3D world where people have avatars and you need to get close to communicate. Move your avatar around a tiny 3d planet and interact with anyone nearby via video call.

There's so much potential for building fun features... Own your own planet, travel to other planets, share files, encrypted chat, build persistent objects in the world, push notifications, voice only calls, funny sounds, avatar customization, file transfer, passkey integration, shared whiteboards.

Inspired by [Gather](https://www.gather.town/virtual-office)

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