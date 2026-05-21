import { uiLog } from '../uiLog';
import { Area } from './area';
import { Avatar } from './avatar';
import { Labeled } from './Labeled';

export type IntersectionEvent = 'enter' | 'exit'
export type IntersectionTarget = Avatar | Area | undefined

export class Intersections extends EventTarget {
	public event: { [Property in IntersectionEvent]: Property } = {
		enter: 'enter',
		exit: 'exit'
	};

	public intersecting = new Set<IntersectionTarget>();
	labelFor = (target: IntersectionTarget) => (target instanceof Area && target.labeled?.text)
		|| (target instanceof Avatar && target.label.text)

	update(target: IntersectionTarget, isIntersecting: boolean | undefined) {
		if (!target) return
		
		if (this.intersecting.has(target)) {
			if (!isIntersecting) {
				this.intersecting.delete(target);
				this.dispatchEvent(new CustomEvent<IntersectionTarget>(this.event.exit, { detail: target }));
				// uiLog(`${isIntersecting ? 'started' : 'stopped'} intersecting ${this.labelFor(target)}`)
			}
		}
		else {
			if (isIntersecting) {
				this.intersecting.add(target);
				this.dispatchEvent(new CustomEvent<IntersectionTarget>(this.event.enter, { detail: target }));
				// uiLog(`${isIntersecting ? 'started' : 'stopped'} intersecting ${this.labelFor(target)}`)
			}
		}
	}
}
