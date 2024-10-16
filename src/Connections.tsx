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
// ✓ draw a continer around rooms 
// - ...and label with room id
// - ...and a "tap to join"
// - constrain points to viewport (for now)
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
		const nodes = props.connections.map(node => Object.assign({}, node))
		console.log('trackStore(connections)', nodes)

		const connectionsByRoomId = new Map<string, string[]>()
		nodes.forEach(con => {
			if (con.roomId) {
				if (!connectionsByRoomId.has(con.roomId))
					connectionsByRoomId.set(con.roomId, [con.id])
				else
					connectionsByRoomId.get(con.roomId).push(con.id)
			}
		})

		const links = []
		const rooms: Room[] = []

		connectionsByRoomId.forEach((users, roomId) => {
			rooms.push({
				id: roomId,
				nodeIds: users
			})
			users.forEach(id1 => users.forEach(id2 => {
				if (id1 != id2) links.push({ source: id1, target: id2 })
			}))
		})

		graph = { nodes, links, rooms }
		update(graph)
	});

	type Room = {
		id: string,
		nodeIds: string[]
	}
	type GraphData = {
		nodes: { id: string }[],
		links: { source: string, target: string }[],
		rooms: Room[]
	}

	let svgRef: SVGSVGElement
	let simulation, nodeCircles, linkLines, roomCircles
	let graph: GraphData

	let svgObserver: ResizeObserver

	onCleanup(() => {
		simulation?.stop()
		svgObserver?.unobserve(svgRef)
	})

	onMount(() => {
		svgObserver = new ResizeObserver(() => {
			simulation?.force('center', d3.forceCenter(svgRef.clientWidth / 2, svgRef.clientHeight / 2))
		})
		svgObserver.observe(svgRef)

		const svg = d3.select(svgRef)

		simulation = d3.forceSimulation()
			.force('center', d3.forceCenter(svgRef.clientWidth / 2, svgRef.clientHeight / 2))
			.force("charge", d3.forceManyBody().strength(-800))
			.force("link", d3.forceLink().id(d => d.id).distance(200))
			.force("x", d3.forceX())
			.force("y", d3.forceY())
			.on("tick", ticked);

		linkLines = svg.append("g")
			.attr("stroke", "#fff")
			.attr("stroke-width", 1.5)
			.selectAll("line");

		nodeCircles = svg.append("g")
			.attr("stroke", "#fff")
			.attr("stroke-width", 1.5)
			.selectAll("circle")
			.attr("r", d => d.status === "online" ? 20 : 10)

		roomCircles = svg.append('g')
			.attr("stroke", "#fff")
			.attr("stroke-width", 2)
			.attr("fill", 'transparent')
			.selectAll("circle")

		function ticked() {
			nodeCircles?.attr("cx", d => d.x)
				.attr("cy", d => d.y)

			linkLines?.attr("x1", d => d.source.x)
				.attr("y1", d => d.source.y)
				.attr("x2", d => d.target.x)
				.attr("y2", d => d.target.y)

			const enclosingCircle = d3.local()
			roomCircles?.each(function (d) {
				const circles = nodeCircles?._groups[0]
					.filter(c => c.__data__.roomId === d.id)
					.map(c => ({
						x: c.cx.animVal.value,
						y: c.cy.animVal.value,
						r: c.r.animVal.value
					}))
				const circle = d3.packEnclose(circles)
				enclosingCircle.set(this, circle)
			})
				.attr("cx", function (d) { return enclosingCircle.get(this)?.x })
				.attr("cy", function (d) { return enclosingCircle.get(this)?.y })
				.attr('r', function (d) { return enclosingCircle.get(this)?.r + 20 })
		}

		if (graph)
			update(graph)
	})

	function update(graphData: GraphData) {

		if (!graphData) return

		let { nodes, links, rooms } = graphData

		// Make a shallow copy to protect against mutation, while
		// recycling old nodes to preserve position and velocity.
		const old = new Map(nodeCircles?.data().map(d => [d.id, d]));
		nodes = nodes?.map(d => Object.assign(old.get(d.id) || {}, d));
		links = links?.map(d => Object.assign({}, d));
		rooms = [...rooms]

		simulation?.nodes(nodes);
		simulation?.force("link").links(links).distance(50); //https://d3js.org/d3-force/link
		simulation?.alpha(1).restart();

		nodeCircles = nodeCircles?.data(nodes, d => d.id)
			.join(
				enter => enter
					.append("circle")
					.attr("r", d => d.status === "online" ? 20 : 10)
					.attr("fill", d => d.color ?? "transparent"),
				update => update
					.attr("r", d => d.status === "online" ? 20 : 10)
					.attr("fill", d => d.color ?? "transparent"));

		linkLines = linkLines?.data(links, d => `${d.source.id}\t${d.target.id}`)
			.join("line");

		console.log('rooms', rooms)
		roomCircles = roomCircles?.data(rooms)
			.join(
				enter => enter
					.append("circle")
					.attr("r", 100)
					.attr('id', d => d.id)
				, update => {
					console.log('update rooms', update)
					return update
				}
			)

	}

	return <div class="congraph">
		<svg ref={svgRef}></svg>
	</div>
}