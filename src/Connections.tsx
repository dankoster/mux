import "./Connections.css"

//@ts-ignore
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

import { trackStore } from "@solid-primitives/deep"
import { createEffect, onMount } from "solid-js";
import { Connection } from "../server/api";
import server from "./data"

export default function ConnectionsGraph(props: { connections: Connection[] }) {

	//get raw connection objects out of the SolidJS Signal where they are proxies
	const data = props.connections.map(node => Object.assign({}, node))

	let conSvg: SVGSVGElement

	//TODO: update the force directed graph to reflect changes to the connections
	// - online/offline status
	// - rooms forming
	// - joining/leaving rooms
	// - zoom in on the user's room! https://observablehq.com/@d3/scatterplot-tour?collection=@d3/d3-zoom
	//
	// instead of drag, let each user move around!
	// - shift the view to follow the user
	// - proximity chat!
	// - some kind of synthwave terrain for location awareness?

	createEffect(() => {
		trackStore(server.connections);
		console.log('trackStore(connections)', server.connections)
	});

	onMount(() => {

		//https://observablehq.com/@d3/disjoint-force-directed-graph/2

		// // Specify the dimensions of the chart.
		// const width = 928;
		// const height = 680;

		// The force simulation mutates links and nodes, so create a copy
		// so that re-evaluating this cell produces the same result.
		const links = [] //data.links.map(d => ({ ...d }));
		const nodes = data.map(d => ({ ...d }));

		// Create a simulation with several forces.
		const simulation = d3.forceSimulation(nodes)
			.force("link", d3.forceLink(links).id(d => d.id))
			//.force("charge", d3.forceManyBody())
			.force('center', d3.forceCenter(conSvg.clientWidth / 2, conSvg.clientHeight / 2))
			.force("x", d3.forceX())
			.force("y", d3.forceY())
			.force("collide", d3.forceCollide(30).iterations(1))

		// Get the SVG container.
		const svg = d3.select('svg')
			// .attr("width", width)
			// .attr("height", height)
			// .attr("viewBox", [-width / 2, -height / 2, width, height])
			//.attr("style", "max-width: 100%; height: auto;");

		// Add a line for each link, and a circle for each node.
		const link = svg.append("g")
			.attr("stroke", "#999")
			.attr("stroke-opacity", 0.6)
			.selectAll("line")
			.data(links)
			.join("line")
			.attr("stroke-width", d => Math.sqrt(d.value));

		const node = svg.append("g")
			.attr("stroke", "#fff")
			.attr("stroke-width", 1.5)
			.selectAll("circle")
			.data(nodes)
			.join("circle")
			.attr("r", 20)
			.attr('stroke', '#fff')
			.attr("fill", d => d.color ?? "transparent")

		node.append("title")
			// .text(d => d.id)
			.text((d: Connection) => `${d.text ? d.text : ''} ${d.status ? d.status : 'offline'} ${d.roomId ? 'in room ' + d.roomId?.substring(d.roomId?.length - 4) : ''}`)

		// Add a drag behavior.
		node.call(d3.drag()
			.on("start", dragstarted)
			.on("drag", dragged)
			.on("end", dragended));

		// Set the position attributes of links and nodes each time the simulation ticks.
		simulation.on("tick", () => {
			link
				.attr("x1", d => d.source.x)
				.attr("y1", d => d.source.y)
				.attr("x2", d => d.target.x)
				.attr("y2", d => d.target.y);

			node
				.attr("cx", d => d.x)
				.attr("cy", d => d.y);
		});

		// Reheat the simulation when drag starts, and fix the subject position.
		function dragstarted(event) {
			if (!event.active) simulation.alphaTarget(0.3).restart();
			event.subject.fx = event.subject.x;
			event.subject.fy = event.subject.y;
		}

		// Update the subject (dragged node) position during drag.
		function dragged(event) {
			event.subject.fx = event.x;
			event.subject.fy = event.y;
		}

		// Restore the target alpha so the simulation cools after dragging ends.
		// Unfix the subject position now that it’s no longer being dragged.
		function dragended(event) {
			if (!event.active) simulation.alphaTarget(0);
			event.subject.fx = null;
			event.subject.fy = null;
		}

		// When this cell is re-run, stop the previous simulation. (This doesn’t
		// really matter since the target alpha is zero and the simulation will
		// stop naturally, but it’s a good practice.)
		//invalidation.then(() => simulation.stop());

	})

	return <div class="congraph">
		<svg ref={conSvg}></svg>
	</div>
}