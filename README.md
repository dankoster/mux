# ⨳ chatMUX

https://chatmux.com/

![production deploy](https://github.com/dankoster/mux/actions/workflows/Droplet.yml/badge.svg)

I'm working toward a group chat service similar to [Discord](https://discord.com/) but with cooperative game world concepts such as proximity chat similar to [Gather](https://www.gather.town/).

All from scratch. No dependencies. No AI.\
Because building stuff is fun.

Currently workign on: 
- Learning [three.js](https://threejs.org/) to make [something fun](https://dgreenheck.github.io/threejs-procedural-planets/)

---

New-to-me learning for this project:
- Peer-to-peer video chat using [webRTC](https://webrtc.org/)
- [GitHub Oauth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) integration for user identity (more to come later)
- Friends with request/accept mechanics (for authenticated uesrs)
- Direct messages and offline messages between friends with end-to-end [AES-GCM encryption](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [D3 force](https://d3js.org/d3-force) visualization of online users 
- [SolidJS](https://www.solidjs.com/) (vanilla JS would actually have been easier)
- [SQLite](https://sqlite.org/) (There is a LOT of [T-SQL](https://en.wikipedia.org/wiki/Transact-SQL) in my past)
- [Deno](https://deno.com/)... `"node".split('').sort().join('')`
- Hosted in a tiny droplet of the [Digital Ocean](https://www.digitalocean.com/) 



------


### iteration 5 [WIP]
> UI work and 3D experimentation

I have figured out a bunch of foundational pieces like hosting, video calling, and e2e encryption. 

Now I want to do some UI work and have some fun with 3D stuff. 

------


### iteration 4
> Good end-to-end encryption, offline messages, and private key sharing

I changed my cryptography standard to [ECDH](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#ecdh)-[AES-GCM](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt#aes-gcm) and implemented fairly robust direct message functionality.
- Private keys are securely shared between connections that authenticate as the same identity.
- Direct messages are now end-to-end encrypted with a securely shared key.
- Unread messages from friends are automatically fetched when loading
- Unread message counts are displayed for each friend
- When opening a chat with unread messages, get all unread PLUS additional history if the number of unread messages is below a minimum threshold.
- I also added a discord-like UI layout that looks pretty good.

Implemented private key sharing for when you connect to the server from multiple devices that have authenticated as the same identity. All connections by the same identity end up with the same private key, allowing for end-to-end encrypted direct messages between users when the users switch devices. This implementation is a bit hacky right now because direct messages are stored on the server by connection, not by identity... but should be fairly easy to clean up in the future. 


------
### iteration 3
> SQLite, Github Actions, friends, and direct messages

DenoKV is out. DenoKV is trash. 🤬\
SQLite is in. SQLite is awesome! 🤩

SQLite really is cool and It's strangely nostalgic to be writing SQL again... but I did it professionally for almost a decade and don't miss it. We'll be keeping the SQL to a minimum.

More devops has happened. I set up a github action for continuous deployment to the Digital Ocean droplet. I can now push to the repo and see my changes live in production seconds later. Full yolo. I also now know more than ever I wanted to about configuring users, services, policies, and permissions on Ubuntu. 

Oh, and I already have a channel for server sent events... so I set up a little local automation to tell the site to refresh when the server detects changes to the dist files, which are re-generated whenever a source file is saved. It's not as granular as HMR, but it's super simple and works great. This solution would even work if I ditch solidJS and go full no-build.

Getting back to code, I also added friends with request/accept mechanics.\
Then I added direct messages between friends.\
Then end-to-end encryption for direct messages.

For the encryption, I'm currently using RSA asymmetric keys. That's super inefficient, but fine for now. Later, I'll learn more and switch to a supported AES block cipher. [[more](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt#supported_algorithms)]

In the meantime... I have long list of other things I want to work on. 

------
### iteration 2
> Oauth, D3, and Devops. \
> I did a linux, and I liked it!

Added github login to let users identify themselves with a name and avatar image. I just implemented [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) from scratch for this. It's a very simple [protocol](https://datatracker.ietf.org/doc/html/rfc6749) to follow. 

Added d3 visualization of chat rooms using [pack enclose](https://observablehq.com/@d3/d3-packenclose) with dynamic [svg path based labels](https://www.visualcinnamon.com/2015/09/placing-text-on-arcs/). 

<img width="400" alt="Screenshot 2024-10-26 at 1 31 57 PM" src="https://github.com/user-attachments/assets/1863085b-8375-42a9-a22c-c16b45c8beb5">

\
Then a friend went to Japan. I thought, 'What a great opportunity to test with someone very geographically distant!" That turned into an epic troubleshooting adventure. I learned a lot about how Deno Deploy works. I tried so hard to get this thing working reliably on Deno Deploy which is not really set up to handle long-running servers. It will spin up V8 isolates geographically close to users and then terminate them with no warning. DenoKV proved to be unreliable in general and a massive pain in practice for synchronizing state between the isolates. This is not the work I'm interested in doing. I've wasted a week on this. Ugh.

...sooo, I moved everything to a Digital Ocean droplet and learned a lot about Linux in the process. That only took a few hours to figure out and now I have one always-on server with HTTPS that should be good for as many users as I'm likely to ever have for this thing, but will be easy to scale vertically if necessary. 

That's enough devops for now. Moving on to more fun stuff.


------
### iteration 1 
> Excited but failrly aimless tinkering

This started out as a quick exploration of [server sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events). Then I got super curious about [webRTC](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API). All the connections flying around needed a fun visualization, so let's learn [D3](https://d3js.org/)! Oh, I also wanted to try [SolidJS](https://www.solidjs.com/). And [Deno](https://deno.com/). Then I was having enough fun that I put it on [deno deploy](https://deno.com/deploy) and got a [domain](https://chatmux.com/). 

Not bad for a couple weeks of excited but fairly aimless tinkering.

