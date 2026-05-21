import * as THREE from 'three'
import * as server from "../data/data";
import * as planet from "./planet";
import { Area } from './area';
import { uiLog } from '../uiLog';

export class Deletable {

	area: Area
	constructor(area: Area) {
		this.area = area
	}

	delete = async () => {
		const result = await server.removeArea(this.area.uuid)
		if (!result.ok) {
			uiLog(`Can't delete! This belongs to ${this.area.params.ownerName}.`)
			console.log(this.area)
			return
		}

		planet.removeArea(this.area.uuid)
	}

}
