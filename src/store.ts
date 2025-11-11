import { create, type Draft } from "mutative";

// Symbols for private methods that can be accessed by other modules in this package
export const UPDATE_STATE_SYMBOL = Symbol("updateState");
export const GET_INITIAL_STATE_SYMBOL = Symbol("getInitialState");

/**
 * A listener function that gets called when the store state changes.
 * @template A - The type of arguments passed to the listener
 */
type Listener = <A>(...args: A[]) => void;

/**
 * A function that takes the previous state and returns the next state.
 * Used for functional updates to the store.
 * @template State - The type of the store state
 */
type UpdaterFn<State> = (prevState: Draft<State>) => void;

/**
 * A store that manages state and provides methods for updates and subscriptions.
 * @template State - The type of the state managed by the store
 *
 * @example
 * ```typescript
 * const store = new Store({ count: 0, name: 'Alice' });
 *
 * // Use with React hook (requires createStoreHook from './react')
 * const useStore = createStoreHook(store);
 * ```
 */
export class Store<State> {
	private listeners: Listener[] = [];
	private currentState: State;
	private readonly initialState: State;

	constructor(initialState: State) {
		this.initialState = initialState;
		this.currentState = initialState;
	}

	/**
	 * Get the current state of the store.
	 * @returns The current state
	 */
	get(): State {
		return this.currentState;
	}

	/**
	 * Set the state to a new value.
	 * @param nextState - The new state value or a function that produces the new state
	 */
	set(nextState: State): void;
	set(updater: UpdaterFn<State>): void;
	set(nextState: State | UpdaterFn<State>): void {
		this.currentState =
			typeof nextState === "function"
				? create(this.currentState, nextState as UpdaterFn<State>)
				: nextState;
		this.listeners.forEach((listener) => listener());
	}

	/**
	 * Subscribe to state changes.
	 * @param listener - The function to call when state changes
	 * @returns A function to unsubscribe the listener
	 */
	on(listener: Listener): () => void {
		this.listeners.push(listener);
		return () => this.off(listener);
	}

	/**
	 * Unsubscribe a listener from state changes.
	 * @param listener - The listener function to remove
	 */
	off(listener: Listener): void {
		this.listeners = this.listeners.filter((fn) => fn !== listener);
	}

	/**
	 * Reset the state to its initial value.
	 */
	reset(): void {
		this.set(this.initialState);
	}

	/**
	 * @internal
	 */
	[UPDATE_STATE_SYMBOL](newState: State): void {
		if (newState !== this.currentState) {
			this.currentState = newState;
			this.listeners.forEach((listener) => listener());
		}
	}

	/**
	 * @internal
	 */
	[GET_INITIAL_STATE_SYMBOL](): State {
		return this.initialState;
	}
}

export type StoreWithPrivateMethods<State> = Store<State> & {
	[UPDATE_STATE_SYMBOL](newState: State): void;
	[GET_INITIAL_STATE_SYMBOL](): State;
};

/**
 * Creates a new store instance with the given initial state.
 * @template State - The type of the state managed by the store
 * @param initialState - The initial state value
 * @returns A new store instance
 */
export function createStore<State>(initialState: State): Store<State> {
	return new Store(initialState);
}

export * from "./react";
