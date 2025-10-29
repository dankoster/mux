import { Area } from './area';
import { Avatar } from './avatar';

export type IntersectionEvent = 'enter' | 'exit'
export type IntersectionTarget = Avatar | Area

export class Intersections extends EventTarget {
	public event: {[Property in IntersectionEvent]: Property} = {
		enter: 'enter',
		exit: 'exit'
	};

	public intersecting = new Set<IntersectionTarget>();

	update(target: IntersectionTarget, isIntersecting: boolean) {
		if (this.intersecting.has(target)) {
			if (!isIntersecting) {
				this.intersecting.delete(target);
				this.dispatchEvent(new CustomEvent<IntersectionTarget>(this.event.exit, { detail: target }));
			}
		}
		else {
			if (isIntersecting) {
				this.intersecting.add(target);
				this.dispatchEvent(new CustomEvent<IntersectionTarget>(this.event.enter, { detail: target }));
			}
		}
	}
}
