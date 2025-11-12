/**
 * This test is just a santity check of the behaviors of mutative.
 * If something here changes, the implementation of my bindings would need
 * to change, so I'm going to keep these tests even though they shouldn't be
 * necessary.
 */

import { describe, expect, test } from "bun:test";
import { create } from "mutative";

describe("Mutative patch behavior", () => {
	const MUTATIVE_OPTS = {
		enablePatches: true,
	} as const;

	describe("Nested object deletion", () => {
		test("deleting an object with nested properties", () => {
			const state = {
				root: {
					foo: {
						bar: "value",
						baz: "another",
					},
					other: "data",
				},
			};

			const [, patches] = create(
				state,
				(draft) => {
					// @ts-expect-error
					delete draft.root.foo;
				},
				MUTATIVE_OPTS,
			);

			expect(patches).toEqual([
				{
					op: "remove",
					path: ["root", "foo"],
				},
			]);
		});

		test("deleting a deeply nested object", () => {
			const state = {
				level1: {
					level2: {
						level3: {
							level4: "deep value",
						},
						sibling: "other",
					},
				},
			};

			const [, patches] = create(
				state,
				(draft) => {
					// @ts-expect-error This technically breaks the types, but it's fine
					delete draft.level1.level2.level3;
				},
				MUTATIVE_OPTS,
			);

			expect(patches).toEqual([
				{
					op: "remove",
					path: ["level1", "level2", "level3"],
				},
			]);
		});
	});

	describe("Array deletion", () => {
		test("removing array element with splice", () => {
			const state = {
				items: ["a", "b", "c"],
			};

			const [, patches] = create(
				state,
				(draft) => {
					draft.items.splice(1, 1); // Remove 'b'
				},
				MUTATIVE_OPTS,
			);

			expect(patches).toEqual([
				{
					op: "replace",
					path: ["items", 1],
					value: "c",
				},
				{
					op: "replace",
					path: ["items", "length"],
					value: 2,
				},
			]);
		});

		test("removing array of objects", () => {
			const state = {
				users: [
					{ id: 1, name: "Alice", profile: { age: 30 } },
					{ id: 2, name: "Bob", profile: { age: 25 } },
				],
			};

			const [, patches] = create(
				state,
				(draft) => {
					draft.users.splice(0, 1); // Remove Alice
				},
				MUTATIVE_OPTS,
			);

			expect(patches).toEqual([
				{
					op: "replace",
					path: ["users", 0],
					value: {
						id: 2,
						name: "Bob",
						profile: {
							age: 25,
						},
					},
				},
				{
					op: "replace",
					path: ["users", "length"],
					value: 1,
				},
			]);
		});
	});

	describe("Replace operations", () => {
		test("replacing a primitive value", () => {
			const state = {
				count: 5,
			};

			const [, patches] = create(
				state,
				(draft) => {
					draft.count = 10;
				},
				MUTATIVE_OPTS,
			);

			expect(patches).toEqual([
				{
					op: "replace",
					path: ["count"],
					value: 10,
				},
			]);
		});

		test("replacing an entire object", () => {
			const state = {
				user: {
					name: "Alice",
					age: 30,
				},
			};

			const [, patches] = create(
				state,
				(draft) => {
					draft.user = { name: "Bob", age: 25 };
				},
				MUTATIVE_OPTS,
			);

			expect(patches).toEqual([
				{
					op: "replace",
					path: ["user"],
					value: {
						name: "Bob",
						age: 25,
					},
				},
			]);
		});
	});

	describe("Add operations", () => {
		test("adding a new property to an object", () => {
			const state = {
				user: {
					name: "Alice",
				},
			};

			const [, patches] = create(
				state,
				(draft) => {
					// @ts-expect-error - adding new property
					draft.user.age = 30;
				},
				MUTATIVE_OPTS,
			);

			expect(patches).toEqual([
				{
					op: "add",
					path: ["user", "age"],
					value: 30,
				},
			]);
		});

		test("adding nested object structure", () => {
			const state = {
				root: {},
			};

			const [, patches] = create(
				state,
				(draft) => {
					// @ts-expect-error - adding new nested structure
					draft.root.foo = {
						bar: {
							baz: "value",
						},
					};
				},
				MUTATIVE_OPTS,
			);

			expect(patches).toEqual([
				{
					op: "add",
					path: ["root", "foo"],
					value: {
						bar: {
							baz: "value",
						},
					},
				},
			]);
		});

		test("pushing to an array", () => {
			const state = {
				items: ["a", "b"],
			};

			const [, patches] = create(
				state,
				(draft) => {
					draft.items.push("c");
				},
				MUTATIVE_OPTS,
			);

			expect(patches).toEqual([
				{
					op: "add",
					path: ["items", 2],
					value: "c",
				},
			]);
		});
	});

	describe("Complex scenarios", () => {
		test("multiple operations in one mutation", () => {
			const state = {
				user: {
					name: "Alice",
					profile: {
						age: 30,
						city: "NYC",
					},
				},
				items: ["a", "b"],
			};

			const [, patches] = create(
				state,
				(draft) => {
					draft.user.name = "Bob"; // replace
					// @ts-expect-error Technically not alloed, but it's fine
					delete draft.user.profile.city; // remove
					draft.items.push("c"); // add
				},
				MUTATIVE_OPTS,
			);

			expect(patches).toEqual([
				{
					op: "add",
					path: ["items", 2],
					value: "c",
				},
				{
					op: "remove",
					path: ["user", "profile", "city"],
				},
				{
					op: "replace",
					path: ["user", "name"],
					value: "Bob",
				},
			]);
		});
	});
});
