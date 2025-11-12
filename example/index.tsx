import { createRoot } from "react-dom/client";
import { createStore } from "../src";
import { useStore } from "../src/react";

const store = createStore({
	count: 0,
});

const App = () => {
	return (
		<div>
			<Label />
			<Buttons />
			<ResetButton />
		</div>
	);
};

function Label() {
	// Subscribe to a slice of state with a selector
	const count = useStore(store, (state) => state.count);
	return <p>The count is {count}</p>;
}

function Buttons() {
	function increment() {
		// Use mutative-style updates with the draft
		store.set((state) => {
			state.count++;
		});
	}

	function decrement() {
		// Or use immutable-style updates
		store.set({ count: store.get().count - 1 });
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
	// selector in Label is wired into the store. #justtheviewlayer
	function reset() {
		store.set({ count: 0 });
	}

	return (
		<button type="button" onClick={reset}>
			Reset
		</button>
	);
}

const container = document.getElementById("root");
if (container) {
	const root = createRoot(container);
	root.render(<App />);
}
