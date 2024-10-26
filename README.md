# ⨳ chatMUX

Peer to peer video chat. 

Chat with people, not AI.

https://chatmux.com/

------
"sprint" 2

Added github login to let users identify themselves with a name and avatar image. I just implemented [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) from scratch for this. It's a very simple [protocol](https://datatracker.ietf.org/doc/html/rfc6749) to follow. 

Added d3 visualization of chat rooms using [pack enclose](https://observablehq.com/@d3/d3-packenclose) with dynamic [svg path based labels](https://www.visualcinnamon.com/2015/09/placing-text-on-arcs/). 

Then a friend went to Japan. I thought, 'What a great opportunity to test with someone very geographically distant!" That turned into an epic troubleshooting adventure. I learned a lot about how Deno Deploy works. I tried so hard to get this thing working reliably on Deno Deploy which is not really set up to handle long-running servers. It will spin up V8 isolates geographically close to users and then terminate them with no warning. DenoKV proved to be unreliable in general and a massive pain in practice for synchronizing state between the isolates. This is not the work I'm interested in doing. I've wasted a week on this. Ugh.

...sooo, I moved everything to a Digital Ocean droplet and learned a lot about to host things in Linux. That only took a few hours to figure out and now I have one always-on server with HTTPS that should be good for as many users as I'm likely to ever have for this thing, but will be easy to scale vertically if necessary. 

That's enough devops for now. Moving on to more fun stuff.


------
"sprint" 1 

This started out as a quick exploration of [server sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events). Then I got super curious about [webRTC](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API). All the connections flying around needed a fun visualization, so let's learn [D3](https://d3js.org/)! Oh, I also wanted to try [SolidJS](https://www.solidjs.com/). And [Deno](https://deno.com/). Then I was having enough fun that I put it on [deno deploy](https://deno.com/deploy) and got a [domain](https://chatmux.com/). 

Not bad for a couple weeks of excited but fairly aimless tinkering.

