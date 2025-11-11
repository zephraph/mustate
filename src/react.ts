import { useSyncExternalStore } from "react";
import type { Store, StoreWithPrivateMethods } from "./store";
import { createStore, GET_INITIAL_STATE_SYMBOL } from "./store";

/**
 * Creates a React hook for the given store that subscribes to state changes and re-renders when the selected state changes.
 *
 * @template State - The type of the state managed by the store
 * @param store - The store instance to create a hook for
 * @returns A React hook function that can be used to subscribe to store changes
 *
 * @example
 * ```typescript
 * const store = createStore({ count: 0, name: 'Alice' });
 * const useStore = createStoreHook(store);
 *
 * // In a React component
 * function Counter() {
 *   const count = useStore(state => state.count);
 *   return <button onClick={() => store.set(draft => { draft.count++ })}>Count: {count}</button>;
 * }
 * ```
 */
export function createStoreHook<State>(store: Store<State>) {
	/**
	 * React hook that subscribes to store changes and re-renders when the selected state changes.
	 *
	 * @template Selected - The type of the selected state slice
	 * @param selector - Optional function to select a slice of state. If not provided, returns the entire state.
	 * @returns The selected state slice
	 *
	 * @example
	 * ```typescript
	 * // Select entire state
	 * const state = useStore();
	 *
	 * // Select a specific property
	 * const count = useStore(state => state.count);
	 *
	 * // Select computed value
	 * const isEven = useStore(state => state.count % 2 === 0);
	 * ```
	 */
	function useStore<Selected = State>(
		selector?: (state: State) => Selected,
	): Selected {
		const getSnapshot = () => {
			const state = store.get();
			return selector ? selector(state) : (state as unknown as Selected);
		};

		const getServerSnapshot = () => {
			const initialState = (store as StoreWithPrivateMethods<State>)[
				GET_INITIAL_STATE_SYMBOL
			]();
			return selector
				? selector(initialState)
				: (initialState as unknown as Selected);
		};

		const selection = useSyncExternalStore(
			(listener) => store.on(listener),
			getSnapshot,
			getServerSnapshot,
		);
		return selection;
	}

	return useStore;
}

/**
 * Creates a store and React hook together as a convenience function.
 * This is equivalent to calling createStore() followed by createStoreHook().
 *
 * @template State - The type of the state managed by the store
 * @param initialState - The initial state value
 * @returns A tuple of [store, useStore] where:
 *   - store: The store instance with methods to get/set state and manage subscriptions
 *   - useStore: A React hook that subscribes to state changes and supports selectors
 *
 * @example
 * ```typescript
 * const [store, useStore] = createStoreWithHook({ count: 0, name: 'Alice' });
 *
 * // In a React component
 * function Counter() {
 *   const count = useStore(state => state.count);
 *   return <button onClick={() => store.set(draft => { draft.count++ })}>Count: {count}</button>;
 * }
 * ```
 */
export function createStoreWithHook<State>(initialState: State) {
	const store = createStore<State>(initialState);
	const useStore = createStoreHook(store);
	return [store, useStore] as const;
}
