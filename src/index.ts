import { create, type Draft } from "mutative";
import { useSyncExternalStore } from "react";

type Listener = <A>(...args: A[]) => void;

type UpdaterFn<State> = (prevState: State) => State;

export interface Store<State> {
	get(): State;
	set(nextState: State): void;
	set(updater: UpdaterFn<State>): void;
	on(listener: Listener): () => void;
	off(listener: Listener): void;
	reset(): void;
	mutate(updater: (draft: Draft<State>) => void): void;
}

export function createStore<State>(initialState: State) {
	let listeners: Listener[] = [];
	let currentState = initialState;
	const store = {
		get() {
			return currentState;
		},
		set(nextState: State | UpdaterFn<State>) {
			currentState =
				typeof nextState === "function"
					? (nextState as UpdaterFn<State>)(currentState)
					: nextState;
			listeners.forEach((listener) => listener());
		},
		on(listener: Listener) {
			listeners.push(listener);
			return () => store.off(listener);
		},
		off(listener: Listener) {
			listeners = listeners.filter((fn) => fn !== listener);
		},
		reset() {
			this.set(initialState);
		},
		mutate(updater: (draft: Draft<State>) => void) {
			const currState = this.get();
			const nextState = create(currState, updater);
			if (nextState !== currState) this.set(nextState as State);
		},
	};

	function useStore<Selected = State>(
		selector?: (state: State) => Selected,
	): Selected {
		const getSnapshot = () => {
			const state = store.get();
			return selector ? selector(state) : (state as unknown as Selected);
		};

		const getServerSnapshot = () => {
			return selector
				? selector(initialState)
				: (initialState as unknown as Selected);
		};

		const selection = useSyncExternalStore(
			store.on,
			getSnapshot,
			getServerSnapshot,
		);
		return selection;
	}

	return [store, useStore] as const;
}
