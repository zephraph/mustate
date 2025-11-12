import { useSyncExternalStore } from "react";
import type { StateType, Store } from "./store";

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
export function useStore<State extends StateType>(store: Store<State>): State;
export function useStore<State extends StateType, Selected>(
	store: Store<State>,
	selector: (state: State) => Selected,
): Selected;
export function useStore<State extends StateType, Selected = State>(
	store: Store<State>,
	selector?: (state: State) => Selected,
): State | Selected {
	selector ??= (state) => state as unknown as Selected;
	return useSyncExternalStore(
		store.subscribe.bind(store),
		() => selector(store.get()),
		// TODO: Does this need to rely on the initial state of the store?
		() => selector(store.get()),
	);
}
