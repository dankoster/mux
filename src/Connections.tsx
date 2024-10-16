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
// ✓ ...and label with room id
// ✓ ...and a "tap to join"
// ✓ constrain points to viewport (for now)
// ✓ always show avatars (just dots for now)
// - zoom in on the user's room! https://observablehq.com/@d3/scatterplot-tour?collection=@d3/d3-zoom
//
// let each user move around?
// - shift the view to follow the user
// - proximity chat!
// - some kind of synthwave terrain for location awareness?

//https://observablehq.com/@d3/modifying-a-force-directed-graph

export default function ConnectionsGraph(props: { self: Connection, connections: Connection[] }) {

	createEffect(() => {
		trackStore(props.connections);

		// get raw connection objects out of the SolidJS Signal where they are proxies
		const nodes = props.connections.map(node => Object.assign({}, node))
		// console.log('trackStore(connections)', nodes)

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

	//TODO: unify types? On the server, the room type has ID, OwnerID, but no nodeIds
	type Room = {
		id: string,
		nodeIds: string[]
	}
	type GraphData = {
		nodes: Connection[],
		links: { source: string, target: string }[],
		rooms: Room[]
	}

	let svgRef: SVGSVGElement
	let simulation, nodeCircles, linkLines, roomCircles, roomLabels
	let graph: GraphData

	let svgObserver: ResizeObserver

	onCleanup(() => {
		simulation?.stop()
		svgObserver?.unobserve(svgRef)
	})

	onMount(() => {

		const svg = d3.select(svgRef)

		linkLines = svg.append("g")
			.attr('class', 'link-lines')
			.attr("stroke", "#fff")
			.attr("stroke-width", 1.5)
			.selectAll("line");

		nodeCircles = svg.append("g")
			.attr('class', 'node-circles')
			.attr("stroke", "#fff")
			.attr("stroke-width", 1.5)
			.selectAll("circle")
			.attr("r", d => d.status === "online" ? 20 : 10)
			.attr("cx", svgRef.clientWidth / 2)
			.attr("cy", svgRef.clientHeight / 2)

		roomCircles = svg.append('g')
			.attr('class', 'room-circles')
			.attr("stroke", "#fff")
			.attr("stroke-width", 2)
			.attr("fill", 'transparent')
			.selectAll("circle")

		roomLabels = svg.append('g')
			.attr('class', 'room-labels')
			.selectAll("text")


		svgObserver = new ResizeObserver(() => {
			updateForceLayout(simulation, null, !!props.self.roomId)
		})
		svgObserver.observe(svgRef)
		simulation = d3.forceSimulation()
		updateForceLayout(simulation, [], !!props.self.roomId)

		simulation.on("tick", function ticked() {
			nodeCircles?.attr("cx", d => d.x)
				.attr("cy", d => d.y)

			linkLines?.attr("x1", d => d.source.x)
				.attr("y1", d => d.source.y)
				.attr("x2", d => d.target.x)
				.attr("y2", d => d.target.y)

			const enclosingCircleByRoomId = {}
			roomCircles?.each(function (d) {
				const circles = nodeCircles?._groups[0]
					.filter(c => c.__data__.roomId === d.id) //find other nodes in the same room
					.map(c => ({
						x: c.cx.animVal.value,
						y: c.cy.animVal.value,
						r: c.r.animVal.value
					}))
				const circle = d3.packEnclose(circles)
				enclosingCircleByRoomId[d.id] = circle
			})
				.attr("cx", d => enclosingCircleByRoomId[d?.id]?.x)
				.attr("cy", d => enclosingCircleByRoomId[d?.id]?.y)
				.attr('r', d => enclosingCircleByRoomId[d?.id]?.r + 20)

			roomLabels?.each(function (d) {
				const circle = enclosingCircleByRoomId[d.id]
				const startAngle = -180 * Math.PI / 180
				const endAngle = -180 * Math.PI / 180 + 2 * Math.PI
				const anticlockwise = false
				const path = d3.path()
				path.arc(circle?.x, circle?.y, circle?.r + 30, startAngle, endAngle, anticlockwise)
				circle.path = path?.toString()
			})

			roomLabels?.selectAll("path")
				.attr("d", d => enclosingCircleByRoomId[d?.id]?.path)

			//HACK: the textPath doesn't re-draw when it's linked path changes
			// so we reset the link to the path on every tick
			roomLabels?.selectAll("textPath")
				.attr("xlink:href", function (d) { return `#${this.previousElementSibling?.id}` })
		});

		if (graph)
			update(graph)
	})

	function updateForceLayout(sim, links, inRoom: boolean) {
		try {
			sim?.force("boundingBox", () => {
				nodeCircles?.each(node => {
					if (node.x < 30) node.x = 30
					if (node.y < 30) node.y = 30
					if (node.x > svgRef.clientWidth - 30) node.x = svgRef.clientWidth - 30
					if (node.y > svgRef.clientHeight - 30) node.y = svgRef.clientHeight - 30
				})
			})

			if (inRoom) {
				sim?.force("x", d3.forceX(svgRef.clientWidth / 2))
					.force("y", d3.forceY(svgRef.clientHeight / 2))
					.force("charge", d3.forceManyBody().strength(500))
					.force("link", null)
					.force("collide", d3.forceCollide((d) => d.r || 50))
			} else {
				sim?.force("x", d3.forceX(svgRef.clientWidth / 2))
					.force("y", d3.forceY(svgRef.clientHeight / 2))
					.force("charge", d3.forceManyBody().strength(-500))
					.force("link", d3.forceLink().id(d => d.id).distance(50))
					.force("collide", d3.forceCollide((d) => d.r))
			}

			const linkForce = simulation?.force("link")
			if (linkForce && Array.isArray(links) && links.length)
				linkForce.links(links).distance(50); //https://d3js.org/d3-force/link

			sim?.alpha(0.6).restart();
		} catch (error) {
			console.error(error)
		}
	}



	function update(graphData: GraphData) {

		if (!graphData) return

		let { nodes, links, rooms } = graphData

		// Make a shallow copy to protect against mutation, while
		// recycling old nodes to preserve position and velocity.
		const old = new Map(nodeCircles?.data().map(d => [d.id, d]));
		nodes = nodes?.map(d => Object.assign(old.get(d.id) || {}, d));
		links = links?.map(d => Object.assign({}, d));
		rooms = [...rooms]

		//if we're in a call, only show ourself and the others in the call
		if (props.self.roomId) {
			nodes = nodes.filter(n => n.roomId === props.self.roomId)
			links = []
			rooms = []
		}

		updateForceLayout(simulation, links, !!props.self.roomId)

		simulation?.nodes(nodes);

		nodeCircles = nodeCircles?.data(nodes, d => d.id)
			.join(
				enter => enter
					.append("circle")
					.transition().duration(1000)
					.style('opacity', d => d.status === "online" ? 1 : 0.2)
					.attr("r", d => d.status === "online" ? 20 : 10)
					.attr("fill", d => d.color ?? "transparent")
				, update => update
					.transition().duration(1000)
					.style('opacity', d => d.status === "online" ? 1 : 0.2)
					.attr("r", d => d.status === "online" ? 20 : 10)
					.attr("fill", d => d.color ?? "transparent")
				, exit => exit
					.transition().duration(1000)
					.style('opacity', 0)
					.attr("r", 0)
					.remove()
			)

		linkLines = linkLines?.data(links, d => `${d.source.id}\t${d.target.id}`)
			.join("line");


		roomCircles = roomCircles?.data(rooms, d => d.id)
			.join(
				enter => enter
					.append("circle")
					.attr('id', d => d.id)
					.on('click', (event, d) => server.joinRoom(d.id))
			)

		const prefix = "roomLabelPath"
		roomLabels = roomLabels?.data(rooms, function (d) {
			// console.log("enter roomLabels", this.id, d.id)
			return d ? d.id : this.id
		})
			.join(enter => {
				const text = enter
					.append("text")
					.attr("fill", "#fff")
					.attr('id', d => d.id)
					.on('click', (event, d) => server.joinRoom(d.id))

				text
					.append("path")
					.attr("id", (d, i) => `${prefix}${i}`)

				text
					.append("textPath")
					.attr("xlink:href", (d, i) => `#${prefix}${i}`)
					.text(d => "tap to join ⤵︎ ") // + d.id?.substring(d.id.length - 4))

				return text
			})
	}

	return <div class="congraph">
		<svg ref={svgRef}></svg>
	</div>
}