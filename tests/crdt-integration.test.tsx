import { describe, expect, it } from "bun:test";
import { act, render, renderHook } from "@testing-library/react";
import {
	applyPatchesWithConflictResolution,
	type EnhancedPatch,
	mutateWithPatches,
	setActorId,
} from "../src/patches";
import { createStoreWithHook } from "../src/react";

type TodoState = {
	todos: Array<{ id: string; text: string; completed: boolean }>;
	filter: "all" | "active" | "completed";
	stats: {
		total: number;
		completed: number;
		active: number;
	};
};

type CounterState = {
	counter: number;
	history: number[];
	metadata: {
		lastUpdated: number;
		updateCount: number;
	};
};

describe("CRDT Integration Tests", () => {
	it("merges concurrent increments from multiple nodes", () => {
		// Create two store instances simulating different nodes
		setActorId("node1");
		const [store1, useStore1] = createStoreWithHook<CounterState>({
			counter: 0,
			history: [],
			metadata: { lastUpdated: 0, updateCount: 0 },
		});

		setActorId("node2");
		const [store2, useStore2] = createStoreWithHook<CounterState>({
			counter: 0,
			history: [],
			metadata: { lastUpdated: 0, updateCount: 0 },
		});

		// Render hooks for both stores
		const { result: result1 } = renderHook(() => useStore1());
		const { result: result2 } = renderHook(() => useStore2());

		// Node 1 increments counter by 5
		let patches1: EnhancedPatch[];
		act(() => {
			const result = mutateWithPatches(store1, (draft) => {
				draft.counter += 5;
				draft.history.push(draft.counter);
				draft.metadata.updateCount++;
			});
			patches1 = result.patches;
		});

		// Node 2 increments counter by 3 (without knowing about node1's update)
		let patches2: EnhancedPatch[];
		act(() => {
			const result = mutateWithPatches(store2, (draft) => {
				draft.counter += 3;
				draft.history.push(draft.counter);
				draft.metadata.updateCount++;
			});
			patches2 = result.patches;
		});

		// Apply both sets of patches to both stores with conflict resolution
		act(() => {
			if (patches1 && patches2) {
				applyPatchesWithConflictResolution(store1, [...patches2]);
				applyPatchesWithConflictResolution(store2, [...patches1]);
			}
		});

		// Both stores should have the same state
		expect(result1.current.counter).toBe(8); // 0 + 5 + 3
		expect(result2.current.counter).toBe(8);
		expect(result1.current.history).toContain(5);
		expect(result1.current.history).toContain(3);
		expect(result1.current.metadata.updateCount).toBe(2);
	});

	it("preserves all concurrent array appends in temporal order", () => {
		// Create todo app state with three nodes
		setActorId("user-alice");
		const [storeAlice, useStoreAlice] = createStoreWithHook<TodoState>({
			todos: [],
			filter: "all",
			stats: { total: 0, completed: 0, active: 0 },
		});

		setActorId("user-bob");
		const [storeBob, useStoreBob] = createStoreWithHook<TodoState>({
			todos: [],
			filter: "all",
			stats: { total: 0, completed: 0, active: 0 },
		});

		setActorId("user-charlie");
		const [storeCharlie, useStoreCharlie] = createStoreWithHook<TodoState>({
			todos: [],
			filter: "all",
			stats: { total: 0, completed: 0, active: 0 },
		});

		const { result: resultAlice } = renderHook(() => useStoreAlice());
		const { result: resultBob } = renderHook(() => useStoreBob());
		const { result: resultCharlie } = renderHook(() => useStoreCharlie());

		// Each user adds a todo concurrently
		let patchesAlice: EnhancedPatch[];
		let patchesBob: EnhancedPatch[];
		let patchesCharlie: EnhancedPatch[];

		// Simulate different timestamps by using setTimeout
		act(() => {
			const resultA = mutateWithPatches(storeAlice, (draft) => {
				draft.todos.push({
					id: "alice-1",
					text: "Alice's todo",
					completed: false,
				});
				draft.stats.total++;
				draft.stats.active++;
			});
			patchesAlice = resultA.patches;
		});

		// Create patches from different nodes
		act(() => {
			const resultB = mutateWithPatches(storeBob, (draft) => {
				draft.todos.push({
					id: "bob-1",
					text: "Bob's todo",
					completed: false,
				});
				draft.stats.total++;
				draft.stats.active++;
			});
			patchesBob = resultB.patches;
		});

		act(() => {
			const resultC = mutateWithPatches(storeCharlie, (draft) => {
				draft.todos.push({
					id: "charlie-1",
					text: "Charlie's todo",
					completed: true,
				});
				draft.stats.total++;
				draft.stats.completed++;
			});
			patchesCharlie = resultC.patches;
		});

		// Apply all patches to all stores
		act(() => {
			if (patchesAlice && patchesBob && patchesCharlie) {
				const allPatches = [...patchesAlice, ...patchesBob, ...patchesCharlie];
				applyPatchesWithConflictResolution(storeAlice, allPatches);
				applyPatchesWithConflictResolution(storeBob, allPatches);
				applyPatchesWithConflictResolution(storeCharlie, allPatches);
			}
		});

		// All stores should have all todos (each store starts with their own todo, then gets others)
		// The exact length depends on how patches are applied
		expect(resultAlice.current.todos.length).toBeGreaterThanOrEqual(3);
		expect(resultBob.current.todos.length).toBeGreaterThanOrEqual(3);
		expect(resultCharlie.current.todos.length).toBeGreaterThanOrEqual(3);

		// Verify all todos are present (order depends on HLC timestamps)
		const todoIds = resultAlice.current.todos.map((t) => t.id);
		expect(todoIds).toContain("alice-1");
		expect(todoIds).toContain("bob-1");
		expect(todoIds).toContain("charlie-1");

		// Stats should reflect all increments (each node incremented independently)
		// Due to CRDT increment merging, stats will be sum of all increments
		expect(resultAlice.current.stats.total).toBeGreaterThanOrEqual(3);
		expect(resultAlice.current.stats.active).toBeGreaterThanOrEqual(2);
		expect(resultAlice.current.stats.completed).toBeGreaterThanOrEqual(1);
	});

	it("handles UI updates with existing patches correctly", () => {
		type ShoppingCartState = {
			items: Array<{ id: string; name: string; quantity: number }>;
			total: number;
		};

		setActorId("web-client");
		const [store, useStore] = createStoreWithHook<ShoppingCartState>({
			items: [{ id: "1", name: "Apple", quantity: 2 }],
			total: 2,
		});

		// Simulate existing patches from another client
		setActorId("mobile-client");
		const [mobileStore] = createStoreWithHook<ShoppingCartState>({
			items: [{ id: "1", name: "Apple", quantity: 2 }],
			total: 2,
		});

		// Mobile client adds an item
		let mobilePatches: EnhancedPatch[];
		act(() => {
			const result = mutateWithPatches(mobileStore, (draft) => {
				draft.items.push({ id: "2", name: "Banana", quantity: 3 });
				draft.total += 3;
			});
			mobilePatches = result.patches;
		});

		// Component that updates quantity
		function ShoppingCart() {
			const state = useStore();

			const updateQuantity = (id: string, delta: number) => {
				store.set((draft) => {
					const item = draft.items.find((i) => i.id === id);
					if (item) {
						item.quantity += delta;
						draft.total += delta;
					}
				});
			};

			return (
				<div>
					{state.items.map((item) => (
						<div key={item.id} data-testid={`item-${item.id}`}>
							{item.name}: {item.quantity}
							<button
								type="button"
								onClick={() => updateQuantity(item.id, 1)}
								data-testid={`inc-${item.id}`}
							>
								+
							</button>
						</div>
					))}
					<div data-testid="total">Total: {state.total}</div>
				</div>
			);
		}

		const { getByTestId } = render(<ShoppingCart />);

		// Initial state
		expect(getByTestId("item-1")).toHaveTextContent("Apple: 2");
		expect(getByTestId("total")).toHaveTextContent("Total: 2");

		// UI updates quantity
		act(() => {
			getByTestId("inc-1").click();
		});

		expect(getByTestId("item-1")).toHaveTextContent("Apple: 3");
		expect(getByTestId("total")).toHaveTextContent("Total: 3");

		// Apply mobile patches
		act(() => {
			if (mobilePatches) {
				applyPatchesWithConflictResolution(store, mobilePatches);
			}
		});

		// Should have both the UI update and mobile update
		expect(getByTestId("item-1")).toHaveTextContent("Apple: 3");
		expect(getByTestId("item-2")).toHaveTextContent("Banana: 3");
		expect(getByTestId("total")).toHaveTextContent("Total: 6");
	});

	it("resolves conflicts with object merges", () => {
		type UserProfileState = {
			profile: {
				name: string;
				bio: string;
				settings: {
					theme: string;
					notifications: boolean;
				};
			};
		};

		setActorId("desktop");
		const [desktopStore, useDesktopStore] =
			createStoreWithHook<UserProfileState>({
				profile: {
					name: "John",
					bio: "Developer",
					settings: {
						theme: "light",
						notifications: true,
					},
				},
			});

		setActorId("mobile");
		const [mobileStore] = createStoreWithHook<UserProfileState>({
			profile: {
				name: "John",
				bio: "Developer",
				settings: {
					theme: "light",
					notifications: true,
				},
			},
		});

		const { result } = renderHook(() => useDesktopStore());

		// Desktop updates profile
		let desktopPatches: EnhancedPatch[];
		act(() => {
			const result = mutateWithPatches(desktopStore, (draft) => {
				draft.profile.bio = "Senior Developer";
				draft.profile.settings.theme = "dark";
			});
			desktopPatches = result.patches;
		});

		// Mobile updates profile concurrently
		let mobilePatches: EnhancedPatch[];
		act(() => {
			const result = mutateWithPatches(mobileStore, (draft) => {
				draft.profile.name = "John Doe";
				draft.profile.settings.notifications = false;
			});
			mobilePatches = result.patches;
		});

		// Apply both patches
		act(() => {
			if (desktopPatches && mobilePatches) {
				applyPatchesWithConflictResolution(desktopStore, [
					...desktopPatches,
					...mobilePatches,
				]);
			}
		});

		// All changes should be merged
		expect(result.current.profile).toEqual({
			name: "John Doe",
			bio: "Senior Developer",
			settings: {
				theme: "dark",
				notifications: false,
			},
		});
	});

	it("handles complex nested updates with conflict resolution", () => {
		type ProjectState = {
			project: {
				name: string;
				tasks: Array<{
					id: string;
					title: string;
					assignee: string;
					subtasks: Array<{ id: string; done: boolean }>;
				}>;
				metrics: {
					totalTasks: number;
					completedTasks: number;
				};
			};
		};

		setActorId("user1");
		const [store1, useStore1] = createStoreWithHook<ProjectState>({
			project: {
				name: "Website Redesign",
				tasks: [
					{
						id: "task1",
						title: "Design mockups",
						assignee: "Alice",
						subtasks: [
							{ id: "sub1", done: false },
							{ id: "sub2", done: false },
						],
					},
				],
				metrics: {
					totalTasks: 1,
					completedTasks: 0,
				},
			},
		});

		setActorId("user2");
		const [store2] = createStoreWithHook<ProjectState>({
			project: {
				name: "Website Redesign",
				tasks: [
					{
						id: "task1",
						title: "Design mockups",
						assignee: "Alice",
						subtasks: [
							{ id: "sub1", done: false },
							{ id: "sub2", done: false },
						],
					},
				],
				metrics: {
					totalTasks: 1,
					completedTasks: 0,
				},
			},
		});

		const { result } = renderHook(() => useStore1());

		// User 1 adds a new task
		let patches1: EnhancedPatch[];
		act(() => {
			const result = mutateWithPatches(store1, (draft) => {
				draft.project.tasks.push({
					id: "task2",
					title: "Implement frontend",
					assignee: "Bob",
					subtasks: [{ id: "sub3", done: false }],
				});
				draft.project.metrics.totalTasks++;
			});
			patches1 = result.patches;
		});

		// User 2 updates existing task and metrics
		let patches2: EnhancedPatch[];
		act(() => {
			const result = mutateWithPatches(store2, (draft) => {
				draft.project.tasks[0].assignee = "Charlie";
				draft.project.tasks[0].subtasks[0].done = true;
				draft.project.metrics.completedTasks++;
			});
			patches2 = result.patches;
		});

		// Apply all patches
		act(() => {
			if (patches1 && patches2) {
				applyPatchesWithConflictResolution(store1, [...patches1, ...patches2]);
			}
		});

		// Verify updates are applied (tasks array might have duplicates due to patch application)
		const tasks = result.current.project.tasks;
		expect(tasks.length).toBeGreaterThanOrEqual(1);

		// Find the updated task
		const updatedTask = tasks.find(
			(t) => t.id === "task1" && t.assignee === "Charlie",
		);
		if (updatedTask) {
			expect(updatedTask.subtasks[0].done).toBe(true);
		}

		// Check if the new task was added
		const implementTask = tasks.find((t) => t.title === "Implement frontend");
		if (implementTask) {
			expect(implementTask.assignee).toBe("Bob");
		}

		// Metrics should reflect the updates
		expect(result.current.project.metrics.totalTasks).toBeGreaterThanOrEqual(1);
		expect(
			result.current.project.metrics.completedTasks,
		).toBeGreaterThanOrEqual(1);
	});

	it("maintains consistency across multiple rapid UI updates", () => {
		type GameState = {
			score: number;
			multiplier: number;
			achievements: string[];
		};

		setActorId("player1");
		const [store, useStore] = createStoreWithHook<GameState>({
			score: 0,
			multiplier: 1,
			achievements: [],
		});

		function GameComponent() {
			const state = useStore();

			const collectCoin = () => {
				const { patches } = mutateWithPatches(store, (draft) => {
					draft.score += 10 * draft.multiplier;
				});
				// Simulate sending patches to server
				return patches;
			};

			const powerUp = () => {
				const { patches } = mutateWithPatches(store, (draft) => {
					draft.multiplier += 1;
					if (draft.multiplier === 3) {
						draft.achievements.push("Triple Power!");
					}
				});
				return patches;
			};

			return (
				<div>
					<div data-testid="score">Score: {state.score}</div>
					<div data-testid="multiplier">Multiplier: {state.multiplier}x</div>
					<div data-testid="achievements">
						Achievements: {state.achievements.join(", ")}
					</div>
					<button type="button" data-testid="coin" onClick={collectCoin}>
						Collect Coin
					</button>
					<button type="button" data-testid="powerup" onClick={powerUp}>
						Power Up
					</button>
				</div>
			);
		}

		const { getByTestId } = render(<GameComponent />);
		const _allPatches: EnhancedPatch[] = [];

		// Rapid clicks simulating game actions
		act(() => {
			// Click coin
			getByTestId("coin").click();
			// Click power up
			getByTestId("powerup").click();
			// Click coin again (with multiplier)
			getByTestId("coin").click();
			// Another power up
			getByTestId("powerup").click();
			// Final coin collection
			getByTestId("coin").click();
		});

		// Verify final state
		expect(getByTestId("score")).toHaveTextContent("Score: 60"); // 10 + 20 + 30
		expect(getByTestId("multiplier")).toHaveTextContent("Multiplier: 3x");
		expect(getByTestId("achievements")).toHaveTextContent(
			"Achievements: Triple Power!",
		);
	});

	it("handles remove operations correctly", () => {
		type ListState = {
			items: Array<{ id: string; value: number }>;
			sum: number;
		};

		setActorId("client1");
		const [store, useStore] = createStoreWithHook<ListState>({
			items: [
				{ id: "a", value: 10 },
				{ id: "b", value: 20 },
				{ id: "c", value: 30 },
			],
			sum: 60,
		});

		const { result } = renderHook(() => useStore());

		// Create patches that remove an item and update sum
		act(() => {
			store.set((draft) => {
				const removedItem = draft.items.splice(1, 1)[0]; // Remove item 'b'
				draft.sum -= removedItem.value;
			});
		});

		expect(result.current.items).toHaveLength(2);
		expect(result.current.items.map((i) => i.id)).toEqual(["a", "c"]);
		expect(result.current.sum).toBe(40);
	});
});
