# ⨳ tinyplanet chat 

![production deploy](https://github.com/dankoster/mux/actions/workflows/Droplet.yml/badge.svg)

I'm making a chat service similar to [Discord](https://discord.com/) but with game world concepts like proximity chat similar to [Gather](https://www.gather.town/). 

It's game-like, not gamified: you don't have to earn points to chat with friends. You can move your avatar around a tiny 3d world and interact with anyone else who is also online. 

This is a silly project to have fun playing with technologies I'm unfamiliar with. \
All from scratch. No dependencies. No AI.\
Because learning and building stuff is fun.

---

### Proof of concept 
https://tinyplanet.chat/ \
It's all very work-in-progress, but it DOES work.
#### POC features
- a tiny 3d planet!
- user avatar - drag the planet to move around
- proximity video call - get close to another avatar to start a call (try it from your phone and computer at the same time!)
- screen sharing - start a video call then hit the screen button
- github auth - click the login button
- domain name, linux server, database, etc

---
### New-to-me learning for this project:
- [three.js](https://threejs.org/) (Check [this](https://dgreenheck.github.io/threejs-procedural-planets/) out!)
- [webRTC](https://webrtc.org/) for peer-to-peer video calls, screen share, etc
- [server sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) and [websockets](https://websocket.org/guides/websocket-protocol/)
- [GitHub Oauth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) integration for user identity 
- [ECDH](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#ecdh)-[AES-GCM](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt#aes-gcm) for end-to-end encryption
- [SolidJS](https://www.solidjs.com/) for pretty lightweight JSX without React
- [Deno](https://deno.com/) for server stuff
- [SQLite](https://sqlite.org/) for database on the server
- [Digital Ocean](https://www.digitalocean.com/) for hosting... had to learn a lot about linux
