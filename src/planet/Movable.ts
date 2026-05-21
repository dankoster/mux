import * as solid from "solid-js"
import * as server from '../data/data';
import * as planet from "../planet/planet";
import { AreaNotification, SSEventPayload } from "../../server/types";
import { shortId } from '../helpers';
import { uiLog } from '../uiLog';
import { Area } from "./area";
import { Avatar } from "./avatar";

export class Movable {
	area: Area
	onAvatarMoved: (avatar: Avatar) => void
	holder: solid.Accessor<Avatar | undefined>
	private setHolder: solid.Setter<Avatar | undefined>

	constructor(area: Area, onAvatarMoved: (avatar: Avatar) => void) {
		this.area = area
		this.onAvatarMoved = onAvatarMoved
		const [holder, setHolder] = solid.createSignal<Avatar>()
		this.holder = holder
		this.setHolder = setHolder

		server.addServerSentEventHandler('grabArea', this.onGrabArea)
		server.addServerSentEventHandler('releaseArea', this.onReleaseArea)
	}

	//TODO: make this action come from the thing the card is representing
	defaultAction = async () => {
		if (this.holder() && this.holder()?.connection?.id) {
			const response = await server.releaseArea({
				conId: this.holder()?.connection?.id ?? '',
				areaId: this.area.uuid,
				position: this.holder()?.mesh.position
			})
			if (response.ok) {
				this.release()
				this.setHolder()
			}
			else
				uiLog(`Failed to release ${shortId(this.area.uuid)}!`)
		}
		else {
			const response = await server.grabArea(this.area.uuid)
			if (response.ok) {
				const avatar = planet.getSelfAvatar()
				if(!avatar) throw new Error(`avatar is ${avatar}`)
				this.grab(avatar)
				this.setHolder(this.holder())
			}
			else
				uiLog(`Access denied, cannot grab ${shortId(this.area.uuid)}!`)
		}
	}

	avatarMoved = () => {
		const avatar = this.holder()
		if (avatar) //this avatar may have moved, but is this avatar holding this movable object?
			this.onAvatarMoved(avatar)
	}

	grab = (avatar: Avatar | undefined) => {
		if (!avatar) throw new Error(`avatar is ${avatar}`)
		if (this.holder()) throw new Error(`already grabbed by ${this.holder()?.label.text}!`)

		this.setHolder(avatar)
		avatar.addEventListener(Avatar.event.moved, this.avatarMoved)
		uiLog(`${avatar.label.text} grabbed ${shortId(this.area.uuid)}`)
	}

	release = (avatar?: Avatar) => {
		if (!this.holder()) throw new Error(`${shortId(this.area.uuid)} is not held by anyone!`)
		if (avatar && avatar.connection?.id !== this.holder()?.connection?.id)
			throw new Error(`${avatar.connection?.id} cannot release area ${shortId(this.area.uuid)}`)

		uiLog(`${this.holder()?.label.text} released ${shortId(this.area.uuid)}`)
		this.holder()?.removeEventListener(Avatar.event.moved, this.avatarMoved)
		this.setHolder()
	}

	private onGrabArea = (payload: SSEventPayload) => {
		const an = JSON.parse(payload.data ?? '') as AreaNotification
		const avatar = planet.getAvatarById(an.conId)
		if(!avatar) throw new Error(`avatar is ${avatar}`)
		const area = planet.getAreaById(an.areaId)
		if (area == this.area)
			area.movable?.grab(avatar) ?? console.warn(`Area ${this.area.uuid} is not movable`)
	}
	private onReleaseArea = (payload: SSEventPayload) => {
		const an = JSON.parse(payload.data ?? '') as AreaNotification
		const avatar = planet.getAvatarById(an.conId)
		const area = planet.getAreaById(an.areaId)
		if (area == this.area)
			area.movable?.release(avatar) ?? console.warn(`Area ${this.area.uuid} is not movable`)
	}
}