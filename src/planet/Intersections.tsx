import { shortId } from '../helpers';
import { Area } from './entity/area';
import { Avatar } from './entity/avatar';

export type IntersectionEvent = 'enter' | 'exit'
export type IntersectionTarget = Avatar | Area | undefined

export class Intersections extends EventTarget {
	public event: { [Property in IntersectionEvent]: Property } = {
		enter: 'enter',
		exit: 'exit'
	};

	public intersecting = new Set<IntersectionTarget>();
	labelFor = (target: IntersectionTarget) => (target instanceof Area && target.labeled?.text || shortId((target as Area)?.uuid))
		|| (target instanceof Avatar && target.label.text)

	update(target: IntersectionTarget, isIntersecting: boolean | undefined) {
		if (!target) return
		
		if (this.intersecting.has(target)) {
			if (!isIntersecting) {
				this.intersecting.delete(target);
				this.dispatchEvent(new CustomEvent<IntersectionTarget>(this.event.exit, { detail: target }));
				// uiLog(`${isIntersecting ? 'Started' : 'Stopped'} intersecting ${this.labelFor(target)}`)
			}
		}
		else {
			if (isIntersecting) {
				this.intersecting.add(target);
				this.dispatchEvent(new CustomEvent<IntersectionTarget>(this.event.enter, { detail: target }));
				// uiLog(`${isIntersecting ? 'Started' : 'Stopped'} intersecting ${this.labelFor(target)}`)
			}
		}
	}
}
