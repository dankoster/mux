import "./Connections.css"

//@ts-ignore
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

import { trackStore } from "@solid-primitives/deep"
import { createEffect, onCleanup, onMount } from "solid-js";
import { Connection } from "../server/api";
import server from "./data"

//TODO: update the force directed graph to reflect changes to the connections
// ✓ online/offline status
// ✓ joining/leaving rooms
// ✓ rooms forming
// - draw a continer around rooms and label with room id
// - zoom in on the user's room! https://observablehq.com/@d3/scatterplot-tour?collection=@d3/d3-zoom
//
// instead of drag, let each user move around!
// - shift the view to follow the user
// - proximity chat!
// - some kind of synthwave terrain for location awareness?

//https://observablehq.com/@d3/modifying-a-force-directed-graph

export default function ConnectionsGraph(props: { connections: Connection[] }) {

	createEffect(() => {
		trackStore(server.connections);


		// get raw connection objects out of the SolidJS Signal where they are proxies
		const connections = props.connections.map(node => Object.assign({}, node))
		console.log('trackStore(connections)', connections)

		const rooms = new Map<string, Connection[]>()
		connections.forEach(con => {
			if (con.roomId) {
				if (!rooms.has(con.roomId))
					rooms.set(con.roomId, [con])
				else
					rooms.get(con.roomId).push(con)
			}
		})
		const links = []
		rooms.forEach(users => users.forEach(u1 => users.forEach(u2 => {
			if (u1 != u2) links.push({ source: u1.id, target: u2.id })
		})))

		console.log(rooms, links)

		graph = {
			nodes: connections,
			links
		}

		// graph = {
		// 	nodes: [
		// 		{ id: "a" },
		// 		{ id: "b" },
		// 		{ id: "c" }
		// 	],
		// 	links: [
		// 		{ source: "a", target: "b" },
		// 		{ source: "b", target: "c" },
		// 		{ source: "c", target: "a" }
		// 	]
		// }

		update(graph)
	});


	let svgRef: SVGSVGElement
	let simulation, node, link
	let graph

	onCleanup(() => {
		simulation?.stop()
	})

	onMount(() => {
		const svg = d3.select(svgRef)

		simulation = d3.forceSimulation()
			.force('center', d3.forceCenter(svgRef.clientWidth / 2, svgRef.clientHeight / 2))
			.force("charge", d3.forceManyBody().strength(-1000))
			.force("link", d3.forceLink().id(d => d.id).distance(200))
			.force("x", d3.forceX())
			.force("y", d3.forceY())
			.on("tick", ticked);

		link = svg.append("g")
			.attr("stroke", "#fff")
			.attr("stroke-width", 1.5)
			.selectAll("line");

		node = svg.append("g")
			.attr("stroke", "#fff")
			.attr("stroke-width", 1.5)
			.selectAll("circle")
			.attr("r", d => d.status === "online" ? 20 : 10)

		function ticked() {
			node.attr("cx", d => d.x)
				.attr("cy", d => d.y)

			link.attr("x1", d => d.source.x)
				.attr("y1", d => d.source.y)
				.attr("x2", d => d.target.x)
				.attr("y2", d => d.target.y);
		}

		if (graph)
			update(graph)
	})

	const color = d3.scaleOrdinal(d3.schemeTableau10)
	function update(u) {

		if (!u) return

		let { nodes, links } = u
		// Make a shallow copy to protect against mutation, while
		// recycling old nodes to preserve position and velocity.
		const old = new Map(node?.data().map(d => [d.id, d]));
		nodes = nodes?.map(d => Object.assign(old.get(d.id) || {}, d));
		links = links?.map(d => Object.assign({}, d));

		simulation?.nodes(nodes);
		simulation?.force("link").links(links);
		simulation?.alpha(1).restart();

		node = node?.data(nodes, d => d.id)
			.join(enter => enter
				.append("circle")
				.attr("r", d => d.status === "online" ? 20 : 10)
				.attr("fill", d => d.color ?? "transparent"),
				update => update
					.attr("r", d => d.status === "online" ? 20 : 10)
					.attr("fill", d => d.color ?? "transparent"));

		link = link?.data(links, d => `${d.source.id}\t${d.target.id}`)
			.join("line");
	}

	return <div class="congraph">
		<svg ref={svgRef}></svg>
	</div>
}