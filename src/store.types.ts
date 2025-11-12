import type { Draft, Patch } from "mutative";
import type { Path, Subscriber } from "./utils/path-trie";

export type StateType = Record<string, unknown>;

/**
 * Utility type to extract the type at a specific path in an object.
 */
export type GetAtPath<T, P extends Path> = P extends []
	? T
	: P extends [infer First, ...infer Rest]
		? First extends keyof T
			? Rest extends Path
				? GetAtPath<T[First], Rest>
				: never
			: never
		: never;

/**
 * A function that takes the previous state and returns the next state.
 * Used for functional updates to the store.
 * @template State - The type of the store state
 */
export type UpdaterFn<State extends StateType> = (
	prevState: Draft<State>,
) => void;

/**
 * Data passed to path-based subscribers
 */
export interface PatchNotification {
	patches: Patch[];
	inversePatches: Patch[];
}

/**
 * A store that manages state and provides methods for updates and subscriptions.
 * Supports both global subscriptions and path-based subscriptions.
 * @template State - The type of the state managed by the store
 *
 * @example
 * ```typescript
 * const store = new Store({ count: 0, user: { name: 'Alice' } });
 *
 * // Global subscription (notified on any change)
 * store.subscribe((patches) => console.log('Changed:', patches));
 *
 * // Path-based subscription (notified only when user.name or ancestors change)
 * store.subscribe(['user', 'name'], (data) => console.log('Name changed:', data));
 * ```
 */
export interface Store<State extends StateType> {
	/**
	 * Get the current state of the store.
	 * @returns The current state
	 */
	get(): Readonly<State>;

	/**
	 * Set the state to a new value.
	 * @param nextState - The new state value or a function that produces the new state
	 */
	set(nextState: State): void;
	set(updater: UpdaterFn<State>): void;

	/**
	 * Subscribe to all state changes.
	 *
	 * @param subscriber - The function to call when state changes
	 * @returns A function to unsubscribe the listener
	 *
	 * @example
	 * ```typescript
	 * // Global subscription
	 * const unsubscribe = store.subscribe((patches, inversePatches) => {
	 *   console.log('State changed:', patches);
	 * });
	 * ```
	 */
	subscribe(subscriber: Subscriber<PatchNotification>): () => void;

	/**
	 * Subscribe to changes at a specific path in the state tree.
	 *
	 * @param path - The path to subscribe to (e.g., ["user", "profile", "age"])
	 * @param subscriber - The function to call when the path or its ancestors/descendants change
	 * @returns A function to unsubscribe the listener
	 *
	 * Notification behavior:
	 * - For "add" and "replace" operations: Notifies if the exact path or any ancestor changes
	 * - For "remove" operations: Notifies if the exact path, any descendant, or any ancestor is removed
	 *
	 * @example
	 * ```typescript
	 * // Subscribe to user.name changes
	 * const unsubscribe = store.subscribe(['user', 'name'], ({ patches }) => {
	 *   console.log('User name changed:', patches);
	 * });
	 * ```
	 */
	subscribe(path: Path, subscriber: Subscriber<PatchNotification>): () => void;
}
