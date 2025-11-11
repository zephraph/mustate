import { createRoot } from "react-dom/client";
import type { Store } from "../src";
import { createStoreWithHook } from "../src/react";

export interface State {
	count: number;
}

export const [store, useStore] = createStoreWithHook<State>({
	count: 0,
});

const App = () => {
	return (
		<div>
			<Label />
			<Buttons store={store} />
			<ResetButton />
		</div>
	);
};

function Label() {
	// Since our Mutik state is just the  { count } itself,
	// our selector is very simple!
	const count = useStore((state) => state.count);
	return <p>The count is {count}</p>;
}

function Buttons({ store }: { store: Store<State> }) {
	function increment() {
		store.set((state) => ({
			...state,
			count: state.count + 1,
		}));
	}

	function decrement() {
		store.set((state) => {
			state.count--;
		});
	}

	return (
		<>
			<button type="button" onClick={decrement}>
				Decrement
			</button>
			<button type="button" onClick={increment}>
				Increment
			</button>
		</>
	);
}

function ResetButton() {
	// Notice how `store` isn't a prop? This still updates because the
	// selector in Label is wired into the mutable store. #justtheviewlayer
	return (
		<button type="button" onClick={() => store.reset()}>
			Reset
		</button>
	);
}

// Simlarly, this works too!
setInterval(() => {
	store.set((state) => {
		state.count++;
	});
}, 3000);

const container = document.getElementById("root");
if (container) {
	const root = createRoot(container);
	root.render(<App />);
}
