import { describe, expect, it } from "bun:test";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { useEffect, useLayoutEffect } from "react";
import { createStoreWithHook } from "../src/react";

type State = {
	count: number;
};

it("uses the store with no args", async () => {
	const [store, useStore] = createStoreWithHook<State>({
		count: 0,
	});

	function Counter() {
		const { count } = useStore();
		useEffect(() => {
			if (count === 0) {
				store.set({ count: count + 1 });
			}
		}, [count]);
		return <div>count: {count}</div>;
	}

	const { findByText } = render(<Counter />);

	await findByText("count: 1");
});

it("uses the store with selectors", async () => {
	const [store, useStore] = createStoreWithHook<State>({
		count: 0,
	});

	function Counter() {
		const count = useStore((state) => state.count);
		useEffect(() => {
			if (count === 0) {
				store.set({ count: count + 1 });
			}
		}, [count]);
		return <div>count: {count}</div>;
	}

	const { findByText } = render(<Counter />);

	await findByText("count: 1");
});

it("uses the store with set", async () => {
	const [store, useStore] = createStoreWithHook<State>({
		count: 0,
	});

	function Counter() {
		const count = useStore((state) => state.count);
		useEffect(() => store.set((draft) => void draft.count++), []);
		return <div>count: {count}</div>;
	}

	const { findByText } = render(<Counter />);

	await findByText("count: 1");
});

it("only re-renders if the selected state changes", async () => {
	type MultiState = {
		count: number;
		name: string;
		settings: { theme: string };
	};

	const [store, useStore] = createStoreWithHook<MultiState>({
		count: 0,
		name: "initial",
		settings: { theme: "light" },
	});

	let countRenderCount = 0;
	let nameRenderCount = 0;
	let themeRenderCount = 0;

	function CountDisplay() {
		const count = useStore((state) => state.count);
		countRenderCount++;
		return <div data-testid="count-display">count: {count}</div>;
	}

	function NameDisplay() {
		const name = useStore((state) => state.name);
		nameRenderCount++;
		return <div data-testid="name-display">name: {name}</div>;
	}

	function ThemeDisplay() {
		const theme = useStore((state) => state.settings.theme);
		themeRenderCount++;
		return <div data-testid="theme-display">theme: {theme}</div>;
	}

	const { getByTestId } = render(
		<>
			<CountDisplay />
			<NameDisplay />
			<ThemeDisplay />
		</>,
	);

	// Initial render should happen for all components
	expect(countRenderCount).toBe(1);
	expect(nameRenderCount).toBe(1);
	expect(themeRenderCount).toBe(1);

	// Change only the count - only CountDisplay should re-render
	act(() => {
		store.set({ count: 1, name: "initial", settings: { theme: "light" } });
	});

	expect(countRenderCount).toBe(2); // Re-rendered
	expect(nameRenderCount).toBe(1); // NOT re-rendered
	expect(themeRenderCount).toBe(1); // NOT re-rendered
	expect(getByTestId("count-display")).toHaveTextContent("count: 1");

	// Change only the name - only NameDisplay should re-render
	act(() => {
		store.set({ count: 1, name: "updated", settings: { theme: "light" } });
	});

	expect(countRenderCount).toBe(2); // NOT re-rendered
	expect(nameRenderCount).toBe(2); // Re-rendered
	expect(themeRenderCount).toBe(1); // NOT re-rendered
	expect(getByTestId("name-display")).toHaveTextContent("name: updated");

	// Change only the theme - only ThemeDisplay should re-render
	act(() => {
		store.set({ count: 1, name: "updated", settings: { theme: "dark" } });
	});

	expect(countRenderCount).toBe(2); // NOT re-rendered
	expect(nameRenderCount).toBe(2); // NOT re-rendered
	expect(themeRenderCount).toBe(2); // Re-rendered
	expect(getByTestId("theme-display")).toHaveTextContent("theme: dark");

	// Change multiple fields - multiple components should re-render
	act(() => {
		store.set({ count: 2, name: "final", settings: { theme: "dark" } });
	});

	expect(countRenderCount).toBe(3); // Re-rendered (count changed)
	expect(nameRenderCount).toBe(3); // Re-rendered (name changed)
	expect(themeRenderCount).toBe(2); // NOT re-rendered (theme unchanged)
});

it("re-renders with useLayoutEffect", async () => {
	const [store, useStore] = createStoreWithHook<{ state: boolean }>({
		state: false,
	});

	function Component() {
		const { state } = useStore();
		useLayoutEffect(() => {
			store.set({ state: true });
		}, []);
		return <>{`${state}`}</>;
	}

	const { container } = render(<Component />);
	await waitFor(() => {
		expect(container.textContent).toBe("true");
	});
});

it("can update the selector", async () => {
	type State = { one: string; two: string };
	const [_store, useStore] = createStoreWithHook<State>({
		one: "one",
		two: "two",
	});

	function Component({
		selector,
	}: {
		selector: (s: { one: string; two: string }) => string;
	}) {
		return <div>{useStore(selector)}</div>;
	}

	const { findByText, rerender } = render(
		<Component selector={(s) => s.one} />,
	);
	await findByText("one");

	rerender(<Component selector={(s) => s.two} />);
	await findByText("two");
});

describe("modern hook tests", () => {
	it("works with renderHook", () => {
		const [store, useStore] = createStoreWithHook({ count: 0 });

		const { result } = renderHook(() => useStore());

		expect(result.current.count).toBe(0);

		act(() => {
			store.set({ count: 1 });
		});

		expect(result.current.count).toBe(1);
	});

	it("selector prevents unnecessary re-renders", () => {
		const [store, useStore] = createStoreWithHook({
			count: 0,
			name: "test",
		});

		let renderCount = 0;
		const { result } = renderHook(() => {
			renderCount++;
			return useStore((state) => state.count);
		});

		expect(renderCount).toBe(1);
		expect(result.current).toBe(0);

		// Changing unrelated state shouldn't re-render
		act(() => {
			store.set({ count: 0, name: "changed" });
		});
		expect(renderCount).toBe(1);

		// Changing selected state should re-render
		act(() => {
			store.set({ count: 1, name: "changed" });
		});
		expect(renderCount).toBe(2);
		expect(result.current).toBe(1);
	});
});
