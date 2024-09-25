import { ApiRoute } from "./api.ts";

export type cacheWatcher<T> = (key: ApiRoute, value?: T) => void;
export class cacheValue<T> {
  #key: ApiRoute;
  #value: T | undefined;
  #watchers: Array<cacheWatcher<T>> = [];
  constructor(key: ApiRoute, value?: T) {
    this.#key = key;
    this.#value = value;
  }
  get value() { return this.#value; }
  set value(value) {
    if (this.#value !== value) {
      console.log('[CACHE SET]', value);
      this.#value = value;
      this.#watchers.forEach(watcher => watcher(this.#key, value));
    }
  }
  addWatcher(watcher: cacheWatcher<T>) {
    this.#watchers.push(watcher);
  }
  removeWatcher(watcher: cacheWatcher<T>) {
    let i = this.#watchers.findIndex(w => w === watcher);
    this.#watchers.splice(i, 1);
  }
}
