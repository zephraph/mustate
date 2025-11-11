import { create, type Patch } from "mutative";
import { DerivedStore } from "./derived-store";
import { type Path, PathTrie, type Subscriber } from "./path-trie";
import type {
	Store as IStore,
	PatchNotification,
	StateType,
	UpdaterFn,
	GetAtPath,
} from "./types";
import { assert } from "./utils";

const MUTATIVE_OPTS = {
	enablePatches: true,
} as const;

export class Store<State extends StateType> implements IStore<State> {
	private subscribers = new PathTrie<PatchNotification>();
	private currentState: State;

	constructor(state: State) {
		this.currentState = state;
	}

	get(): Readonly<State> {
		return this.currentState;
	}

	set(nextState: State): void;
	set(updater: UpdaterFn<State>): void;
	set(nextState: State | UpdaterFn<State>): void {
		if (this.currentState === nextState) return;

		const [state, patches, inversePatches] =
			typeof nextState === "function"
				? create(this.currentState, nextState, MUTATIVE_OPTS)
				: create(
						this.currentState,
						(draft) => {
							Object.assign(draft, nextState);
						},
						MUTATIVE_OPTS,
					);

		this.currentState = state;
		this.#notifyPathSubscribers(patches, inversePatches);
	}

	/**
	 * Notify all subscribers based on the patches
	 */
	#notifyPathSubscribers(patches: Patch[], inversePatches: Patch[]): void {
		const notificationData: PatchNotification = { patches, inversePatches };
		const notifiedSubscribers = new Set<Subscriber<PatchNotification>>();

		for (const patch of patches) {
			const affected = this.subscribers.getAffectedSubscribers(
				patch.path as Path,
				patch.op as "add" | "remove" | "replace",
			);

			for (const subscriber of affected) {
				if (!notifiedSubscribers.has(subscriber)) {
					subscriber(notificationData);
					notifiedSubscribers.add(subscriber);
				}
			}
		}
	}

	subscribe(subscriber: Subscriber<PatchNotification>): () => void;
	subscribe(path: Path, subscriber: Subscriber<PatchNotification>): () => void;

	subscribe(
		pathOrSubscriber: Path | Subscriber<PatchNotification>,
		maybeSubscriber?: Subscriber<PatchNotification>,
	): () => void {
		// Global subscription (treat as root path subscription)
		if (typeof pathOrSubscriber === "function") {
			return this.subscribers.subscribe([], pathOrSubscriber);
		}

		// Path-based subscription
		const path = pathOrSubscriber;
		assert(
			maybeSubscriber,
			"Subscriber function is required for path-based subscriptions",
		);
		return this.subscribers.subscribe(path, maybeSubscriber);
	}

	select<P extends Path>(
		path: P,
	): GetAtPath<State, P> extends StateType
		? IStore<GetAtPath<State, P>>
		: never {
		return new DerivedStore(this, path) as any;
	}
}

/**
 * Creates a new store instance with the given initial state.
 * @template State - The type of the state managed by the store
 * @param initialState - The initial state value
 * @returns A new store instance
 */
export function createStore<State extends StateType>(
	initialState: State,
): Store<State> {
	return new Store(initialState);
}
