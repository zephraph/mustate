import { describe, expect, test } from "vitest";
import { asString, createHLC, tick } from "./hlc";
import {
	applyEnhancedPatches,
	type CRDTOperation,
	createPatchesFromMutation,
	type EnhancedPatch,
	enhancePatches,
	resolveConflicts,
	type StandardPatch,
	setActorId,
} from "./patches";

describe("CRDT Patches", () => {
	describe("setNodeId", () => {
		test("should set a custom node ID", () => {
			setActorId("test-node");
			const state = { counter: 0 };
			const { patches } = createPatchesFromMutation(state, (draft) => {
				draft.counter = 5;
			});
			const enhanced = enhancePatches(patches, state, { counter: 5 });
			const crdtOp = enhanced[0] as CRDTOperation;
			expect(crdtOp.hlc).toContain("test-node");
		});
	});

	describe("createPatchesFromMutation", () => {
		test("should create patches from state mutation", () => {
			const state = { counter: 0, name: "test" };
			const { nextState, patches } = createPatchesFromMutation(
				state,
				(draft) => {
					draft.counter = 5;
					draft.name = "updated";
				},
			);

			expect(nextState).toEqual({ counter: 5, name: "updated" });
			expect(patches).toHaveLength(2);
			expect(patches[0]).toEqual({
				op: "replace",
				path: "/counter",
				value: 5,
			});
			expect(patches[1]).toEqual({
				op: "replace",
				path: "/name",
				value: "updated",
			});
		});

		test("should handle array operations", () => {
			const state = { items: ["a", "b"] };
			const { nextState, patches } = createPatchesFromMutation(
				state,
				(draft) => {
					draft.items.push("c");
				},
			);

			expect(nextState).toEqual({ items: ["a", "b", "c"] });
			expect(patches).toHaveLength(1);
			expect(patches[0]).toEqual({
				op: "add",
				path: "/items/2",
				value: "c",
			});
		});

		test("should handle nested object mutations", () => {
			const state = { user: { name: "John", age: 30 } };
			const { nextState, patches } = createPatchesFromMutation(
				state,
				(draft) => {
					draft.user.age = 31;
				},
			);

			expect(nextState).toEqual({ user: { name: "John", age: 31 } });
			expect(patches).toHaveLength(1);
			expect(patches[0]).toEqual({
				op: "replace",
				path: "/user/age",
				value: 31,
			});
		});
	});

	describe("enhancePatches", () => {
		test("should detect increment operations", () => {
			const prevState = { counter: 5 };
			const nextState = { counter: 8 };
			const patches: StandardPatch[] = [
				{ op: "replace", path: "/counter", value: 8 },
			];

			const enhanced = enhancePatches(patches, prevState, nextState);
			expect(enhanced).toHaveLength(1);

			const crdtOp = enhanced[0] as CRDTOperation;
			expect(crdtOp.type).toBe("crdt");
			expect(crdtOp.op).toBe("increment");
			expect(crdtOp.value).toBe(3);
			expect(crdtOp.path).toBe("/counter");
		});

		test("should detect decrement operations", () => {
			const prevState = { counter: 8 };
			const nextState = { counter: 3 };
			const patches: StandardPatch[] = [
				{ op: "replace", path: "/counter", value: 3 },
			];

			const enhanced = enhancePatches(patches, prevState, nextState);
			const crdtOp = enhanced[0] as CRDTOperation;
			expect(crdtOp.op).toBe("decrement");
			expect(crdtOp.value).toBe(5);
		});

		test("should detect array append operations", () => {
			const prevState = { items: ["a", "b"] };
			const nextState = { items: ["a", "b", "c"] };
			const patches: StandardPatch[] = [
				{ op: "add", path: "/items/2", value: "c" },
			];

			const enhanced = enhancePatches(patches, prevState, nextState);
			const crdtOp = enhanced[0] as CRDTOperation;
			expect(crdtOp.op).toBe("append");
			expect(crdtOp.path).toBe("/items");
			expect(crdtOp.value).toBe("c");
		});

		test("should detect object merge operations", () => {
			const prevState = { user: { name: "John" } };
			const nextState = { user: { name: "John", age: 30 } };
			const patches: StandardPatch[] = [
				{ op: "replace", path: "/user", value: { name: "John", age: 30 } },
			];

			const enhanced = enhancePatches(patches, prevState, nextState);
			const crdtOp = enhanced[0] as CRDTOperation;
			expect(crdtOp.op).toBe("merge");
			expect(crdtOp.value).toEqual({ name: "John", age: 30 });
		});

		test("should pass through non-semantic operations", () => {
			const prevState = { name: "John" };
			const nextState = { name: "Jane" };
			const patches: StandardPatch[] = [
				{ op: "replace", path: "/name", value: "Jane" },
			];

			const enhanced = enhancePatches(patches, prevState, nextState);
			expect(enhanced[0]).toEqual(patches[0]);
		});

		test("should handle zero-diff numeric changes", () => {
			const prevState = { counter: 5 };
			const nextState = { counter: 5 };
			const patches: StandardPatch[] = [
				{ op: "replace", path: "/counter", value: 5 },
			];

			const enhanced = enhancePatches(patches, prevState, nextState);
			expect(enhanced[0]).toEqual(patches[0]); // Should pass through unchanged
		});
	});

	describe("applyEnhancedPatches", () => {
		test("should apply increment operations", () => {
			const state = { counter: 5 };
			const hlc = asString(tick(createHLC("node1")));
			const patches: EnhancedPatch[] = [
				{
					op: "increment",
					path: "/counter",
					value: 3,
					hlc,
					type: "crdt",
				},
			];

			const result = applyEnhancedPatches(state, patches);
			expect(result).toEqual({ counter: 8 });
		});

		test("should apply decrement operations", () => {
			const state = { counter: 10 };
			const hlc = asString(tick(createHLC("node1")));
			const patches: EnhancedPatch[] = [
				{
					op: "decrement",
					path: "/counter",
					value: 4,
					hlc,
					type: "crdt",
				},
			];

			const result = applyEnhancedPatches(state, patches);
			expect(result).toEqual({ counter: 6 });
		});

		test("should apply append operations", () => {
			const state = { items: ["a", "b"] };
			const hlc = asString(tick(createHLC("node1")));
			const patches: EnhancedPatch[] = [
				{
					op: "append",
					path: "/items",
					value: "c",
					hlc,
					type: "crdt",
				},
			];

			const result = applyEnhancedPatches(state, patches);
			expect(result).toEqual({ items: ["a", "b", "c"] });
		});

		test("should apply merge operations", () => {
			const state = { user: { name: "John" } };
			const hlc = asString(tick(createHLC("node1")));
			const patches: EnhancedPatch[] = [
				{
					op: "merge",
					path: "/user",
					value: { age: 30 },
					hlc,
					type: "crdt",
				},
			];

			const result = applyEnhancedPatches(state, patches);
			expect(result).toEqual({ user: { name: "John", age: 30 } });
		});

		test("should apply replace operations", () => {
			const state = { name: "John" };
			const hlc = asString(tick(createHLC("node1")));
			const patches: EnhancedPatch[] = [
				{
					op: "replace",
					path: "/name",
					value: "Jane",
					hlc,
					type: "crdt",
				},
			];

			const result = applyEnhancedPatches(state, patches);
			expect(result).toEqual({ name: "Jane" });
		});

		test("should apply standard patches", () => {
			const state = { name: "John" };
			const patches: EnhancedPatch[] = [
				{
					op: "replace",
					path: "/name",
					value: "Jane",
				},
			];

			const result = applyEnhancedPatches(state, patches);
			expect(result).toEqual({ name: "Jane" });
		});

		test("should sort patches by HLC before applying", () => {
			const state = { counter: 0 };
			const hlc1 = createHLC("node1", 1000);
			const hlc2 = createHLC("node1", 2000);

			const patches: EnhancedPatch[] = [
				{
					op: "increment",
					path: "/counter",
					value: 5,
					hlc: asString(hlc2), // Later timestamp
					type: "crdt",
				},
				{
					op: "increment",
					path: "/counter",
					value: 3,
					hlc: asString(hlc1), // Earlier timestamp
					type: "crdt",
				},
			];

			const result = applyEnhancedPatches(state, patches);
			expect(result).toEqual({ counter: 8 }); // 0 + 3 + 5
		});
	});

	describe("resolveConflicts", () => {
		test("should merge multiple increment operations", () => {
			const hlc1 = asString(createHLC("node1", 1000));
			const hlc2 = asString(createHLC("node2", 2000));

			const patches: EnhancedPatch[] = [
				{
					op: "increment",
					path: "/counter",
					value: 3,
					hlc: hlc1,
					type: "crdt",
				},
				{
					op: "increment",
					path: "/counter",
					value: 5,
					hlc: hlc2,
					type: "crdt",
				},
			];

			const resolved = resolveConflicts(patches);
			expect(resolved).toHaveLength(1);
			const mergedOp = resolved[0] as CRDTOperation;
			expect(mergedOp.op).toBe("increment");
			expect(mergedOp.value).toBe(8);
			expect(mergedOp.hlc).toBe(hlc2); // Should use latest HLC
		});

		test("should merge multiple decrement operations", () => {
			const hlc1 = asString(createHLC("node1", 1000));
			const hlc2 = asString(createHLC("node2", 2000));

			const patches: EnhancedPatch[] = [
				{
					op: "decrement",
					path: "/counter",
					value: 2,
					hlc: hlc1,
					type: "crdt",
				},
				{
					op: "decrement",
					path: "/counter",
					value: 3,
					hlc: hlc2,
					type: "crdt",
				},
			];

			const resolved = resolveConflicts(patches);
			expect(resolved).toHaveLength(1);
			const mergedOp = resolved[0] as CRDTOperation;
			expect(mergedOp.op).toBe("decrement");
			expect(mergedOp.value).toBe(5);
		});

		test("should preserve all append operations in HLC order", () => {
			const hlc1 = asString(createHLC("node1", 1000));
			const hlc2 = asString(createHLC("node2", 2000));
			const hlc3 = asString(createHLC("node3", 1500));

			const patches: EnhancedPatch[] = [
				{
					op: "append",
					path: "/items",
					value: "c",
					hlc: hlc2,
					type: "crdt",
				},
				{
					op: "append",
					path: "/items",
					value: "a",
					hlc: hlc1,
					type: "crdt",
				},
				{
					op: "append",
					path: "/items",
					value: "b",
					hlc: hlc3,
					type: "crdt",
				},
			];

			const resolved = resolveConflicts(patches);
			expect(resolved).toHaveLength(3);
			expect((resolved[0] as CRDTOperation).value).toBe("a");
			expect((resolved[1] as CRDTOperation).value).toBe("b");
			expect((resolved[2] as CRDTOperation).value).toBe("c");
		});

		test("should use last writer wins for other CRDT operations", () => {
			const hlc1 = asString(createHLC("node1", 1000));
			const hlc2 = asString(createHLC("node2", 2000));

			const patches: EnhancedPatch[] = [
				{
					op: "replace",
					path: "/name",
					value: "John",
					hlc: hlc1,
					type: "crdt",
				},
				{
					op: "replace",
					path: "/name",
					value: "Jane",
					hlc: hlc2,
					type: "crdt",
				},
			];

			const resolved = resolveConflicts(patches);
			expect(resolved).toHaveLength(1);
			expect((resolved[0] as CRDTOperation).value).toBe("Jane");
		});

		test("should handle mixed CRDT and standard patches", () => {
			const hlc = asString(createHLC("node1"));
			const patches: EnhancedPatch[] = [
				{
					op: "increment",
					path: "/counter",
					value: 3,
					hlc,
					type: "crdt",
				},
				{
					op: "replace",
					path: "/name",
					value: "John",
				},
			];

			const resolved = resolveConflicts(patches);
			expect(resolved).toHaveLength(2);
		});

		test("should handle patches for different paths separately", () => {
			const hlc = asString(createHLC("node1"));
			const patches: EnhancedPatch[] = [
				{
					op: "increment",
					path: "/counter1",
					value: 3,
					hlc,
					type: "crdt",
				},
				{
					op: "increment",
					path: "/counter2",
					value: 5,
					hlc,
					type: "crdt",
				},
			];

			const resolved = resolveConflicts(patches);
			expect(resolved).toHaveLength(2);
		});

		test("should handle single patches without conflicts", () => {
			const hlc = asString(createHLC("node1"));
			const patches: EnhancedPatch[] = [
				{
					op: "increment",
					path: "/counter",
					value: 3,
					hlc,
					type: "crdt",
				},
			];

			const resolved = resolveConflicts(patches);
			expect(resolved).toEqual(patches);
		});
	});

	describe("Integration tests", () => {
		test("should handle complex concurrent operations", () => {
			// Initial state
			const state = {
				counter: 10,
				items: ["a", "b"],
				user: { name: "John", age: 30 },
			};

			// Simulate concurrent operations from different nodes
			setActorId("node1");
			const { patches: patches1 } = createPatchesFromMutation(
				state,
				(draft) => {
					draft.counter += 5; // increment
					draft.items.push("c"); // append
				},
			);
			const enhanced1 = enhancePatches(patches1, state, {
				counter: 15,
				items: ["a", "b", "c"],
				user: { name: "John", age: 30 },
			});

			setActorId("node2");
			const { patches: patches2 } = createPatchesFromMutation(
				state,
				(draft) => {
					draft.counter += 3; // increment
					draft.items.push("d"); // append
					draft.user.age = 31; // replace
				},
			);
			const enhanced2 = enhancePatches(patches2, state, {
				counter: 13,
				items: ["a", "b", "d"],
				user: { name: "John", age: 31 },
			});

			// Combine and resolve conflicts
			const allPatches = [...enhanced1, ...enhanced2];
			const resolved = resolveConflicts(allPatches);
			const finalState = applyEnhancedPatches(state, resolved);

			// Verify results
			expect(finalState.counter).toBe(18); // 10 + 5 + 3
			expect(finalState.items).toContain("c");
			expect(finalState.items).toContain("d");
			expect(finalState.user.age).toBe(31);
		});

		test("should maintain deterministic ordering across multiple runs", () => {
			const state = { items: [] };
			const hlc1 = asString(createHLC("node1", 1000));
			const hlc2 = asString(createHLC("node2", 2000));
			const hlc3 = asString(createHLC("node3", 1500));

			const patches: EnhancedPatch[] = [
				{
					op: "append",
					path: "/items",
					value: "third",
					hlc: hlc2,
					type: "crdt",
				},
				{
					op: "append",
					path: "/items",
					value: "first",
					hlc: hlc1,
					type: "crdt",
				},
				{
					op: "append",
					path: "/items",
					value: "second",
					hlc: hlc3,
					type: "crdt",
				},
			];

			// Run multiple times to ensure deterministic ordering
			for (let i = 0; i < 5; i++) {
				const resolved = resolveConflicts([...patches]);
				const result = applyEnhancedPatches(state, resolved);
				expect(result.items).toEqual(["first", "second", "third"]);
			}
		});
	});
});
