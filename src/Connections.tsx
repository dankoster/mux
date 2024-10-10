import "./Connections.css"

//@ts-ignore
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { onMount } from "solid-js";
import { Connection } from "../server/api";
import server from "./data"

export default function ConnectionsGraph(props: { connections: Connection[] }) {

	//get raw connection objects out of the SolidJS Signal where they are proxies
	const nodes = props.connections.map(node => Object.assign({}, node))

	let conSvg: SVGSVGElement

	const runSimulation = () => {
		const simulation = d3.forceSimulation(nodes)
			.force('charge', d3.forceManyBody().strength(-20))
			.force('center', d3.forceCenter(conSvg.clientWidth / 2, conSvg.clientHeight / 2))
			.on('tick', ticked);

		function ticked() {
			d3.select('svg')
				.selectAll('circle')
				.data(nodes)
				.join('circle')
				.attr('r', 10)
				.attr('cx', (d) => d.x)
				.attr('cy', (d) => d.y)
				.attr("fill", d => d.color)
				// .on('click', (d, i: Connection) => {
				// 	server.sendDM(i.id, JSON.stringify(i))
				// })
		}
	}

	// server.onDM(dm => console.log(`DM from: ${dm.senderId}`, JSON.parse(dm.message)))

	onMount(() => {
		console.log('d3 with', nodes)
		runSimulation()

		let timeout: number
		function resize(observer) {

			clearTimeout(timeout)
			timeout = setTimeout(() => {
				//TODO: actually re-run the simulation properly
				runSimulation()
			}, 500);

		}

		new ResizeObserver(resize).observe(conSvg);

	})

	return <div class="congraph">
		<svg ref={conSvg}></svg>
	</div>
}