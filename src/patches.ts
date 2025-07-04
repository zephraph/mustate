import { create, type Draft, makeCreator } from "mutative";
import {
	asString,
	compare,
	createHLC,
	fromString,
	type HLCString,
	tick,
} from "./hlc";
import type { Store, StoreWithPrivateMethods } from "./index";
import { UPDATE_STATE_SYMBOL } from "./index";

// Type for patch values - can be primitive, object, or array
type PatchValue = string | number | boolean | null | object | unknown[];

export interface CRDTOperation {
	op: "increment" | "decrement" | "append" | "merge" | "replace";
	path: string;
	value: PatchValue;
	hlc: HLCString;
	type: "crdt";
}

export interface StandardPatch {
	op: "replace" | "add" | "remove";
	path: string;
	value?: PatchValue;
}

export type EnhancedPatch = CRDTOperation | StandardPatch;

// Create a patch-enabled create function
const createWithPatches = makeCreator({ enablePatches: true });

// Default node ID for this instance
let defaultNode = Math.random().toString(36).substr(2, 9);
let hlcInstance = createHLC(defaultNode);

export function setActorId(nodeId: string): void {
	defaultNode = nodeId;
	hlcInstance = createHLC(nodeId);
}

export function createPatchesFromMutation<T>(
	state: T,
	mutator: (draft: Draft<T>) => void,
): { nextState: T; patches: StandardPatch[] } {
	const [nextState, patches] = createWithPatches(state, mutator);
	return {
		nextState,
		patches: (
			patches as Array<{
				op: "add" | "replace" | "remove";
				path: string | string[];
				value?: PatchValue;
			}>
		).map((p) => ({
			op: p.op,
			path: Array.isArray(p.path) ? `/${p.path.join("/")}` : p.path,
			value: p.value,
		})),
	};
}

/**
 * Mutate a store's state and capture the patches that represent the changes.
 * Useful for synchronizing state changes across distributed systems.
 * @param store - The store instance to mutate
 * @param updater - A function that receives a draft of the state to mutate
 * @returns An object containing the new state and the patches with CRDT enhancements
 */
export function mutateWithPatches<State>(
	store: Store<State>,
	updater: (draft: Draft<State>) => void,
): {
	nextState: State;
	patches: EnhancedPatch[];
} {
	const currState = store.get();
	const { nextState, patches } = createPatchesFromMutation(currState, updater);
	const enhancedPatches = enhancePatches(patches, currState, nextState);
	(store as StoreWithPrivateMethods<State>)[UPDATE_STATE_SYMBOL](nextState);
	return { nextState, patches: enhancedPatches };
}

export function enhancePatches<T = unknown>(
	patches: StandardPatch[],
	prevState: T,
	nextState: T,
): EnhancedPatch[] {
	const enhancedPatches: EnhancedPatch[] = [];

	for (const patch of patches) {
		const enhanced = detectSemanticOperation<T>(patch, prevState, nextState);
		enhancedPatches.push(enhanced);
	}

	return enhancedPatches;
}

function detectSemanticOperation<T = unknown>(
	patch: StandardPatch,
	prevState: T,
	_nextState: T,
): EnhancedPatch {
	if (patch.op === "replace") {
		const pathValue = getValueAtPath<T>(prevState, patch.path);
		const newValue = patch.value;

		// Detect numeric increment/decrement
		if (typeof pathValue === "number" && typeof newValue === "number") {
			const diff = newValue - pathValue;
			if (diff !== 0) {
				hlcInstance = tick(hlcInstance);
				return {
					op: diff > 0 ? "increment" : "decrement",
					path: patch.path,
					value: Math.abs(diff),
					hlc: asString(hlcInstance),
					type: "crdt",
				};
			}
		}

		// Detect object merge (if old value is object and new value extends it)
		if (isPlainObject(pathValue) && isPlainObject(newValue)) {
			const oldKeys = Object.keys(pathValue);
			const newKeys = Object.keys(newValue);
			const hasNewKeys = newKeys.some((key) => !oldKeys.includes(key));
			const hasChangedKeys = oldKeys.some(
				(key) => pathValue[key] !== newValue[key],
			);

			if (hasNewKeys || hasChangedKeys) {
				hlcInstance = tick(hlcInstance);
				return {
					op: "merge",
					path: patch.path,
					value: newValue,
					hlc: asString(hlcInstance),
					type: "crdt",
				};
			}
		}
	}

	if (patch.op === "add") {
		const pathParts = patch.path.split("/").filter(Boolean);
		const parentPath = `/${pathParts.slice(0, -1).join("/")}`;
		const parentValue = getValueAtPath<T>(prevState, parentPath);

		// Detect array append
		if (Array.isArray(parentValue) && patch.value !== undefined) {
			const index = pathParts[pathParts.length - 1];
			if (index === "-" || parseInt(index) === parentValue.length) {
				hlcInstance = tick(hlcInstance);
				return {
					op: "append",
					path: parentPath,
					value: patch.value,
					hlc: asString(hlcInstance),
					type: "crdt",
				};
			}
		}
	}

	// Fallback to standard patch
	return patch;
}

export function applyEnhancedPatches<T>(state: T, patches: EnhancedPatch[]): T {
	// Sort CRDT operations by HLC for deterministic application
	const sortedPatches = [...patches].sort((a, b) => {
		if ("hlc" in a && "hlc" in b) {
			const hlcA = fromString(a.hlc);
			const hlcB = fromString(b.hlc);
			return compare(hlcA, hlcB);
		}
		return 0;
	});

	return create(state, (draft: Draft<T>) => {
		for (const patch of sortedPatches) {
			if ("type" in patch && patch.type === "crdt") {
				applyCRDTOperation<Draft<T>>(draft, patch);
			} else {
				applyStandardPatch<Draft<T>>(draft, patch as StandardPatch);
			}
		}
	});
}

/**
 * Apply a set of patches to a store's state.
 * @param store - The store instance to apply patches to
 * @param patches - The patches to apply (can include CRDT operations)
 */
export function applyPatches<State>(
	store: Store<State>,
	patches: EnhancedPatch[],
): void {
	const currState = store.get();
	const nextState = applyEnhancedPatches(currState, patches);
	(store as StoreWithPrivateMethods<State>)[UPDATE_STATE_SYMBOL](nextState);
}

/**
 * Apply patches with automatic conflict resolution using CRDT semantics.
 * Multiple patches affecting the same path will be merged according to their operation type.
 * @param store - The store instance to apply patches to
 * @param patches - The patches to apply with conflict resolution
 */
export function applyPatchesWithConflictResolution<State>(
	store: Store<State>,
	patches: EnhancedPatch[],
): void {
	const resolvedPatches = resolveConflicts(patches);
	applyPatches(store, resolvedPatches);
}

function applyCRDTOperation<T = unknown>(
	draft: T,
	operation: CRDTOperation,
): void {
	const current = getValueAtPath<T>(draft, operation.path);

	switch (operation.op) {
		case "increment":
			if (typeof current === "number" && typeof operation.value === "number") {
				setValueAtPath<T>(draft, operation.path, current + operation.value);
			}
			break;

		case "decrement":
			if (typeof current === "number" && typeof operation.value === "number") {
				setValueAtPath<T>(draft, operation.path, current - operation.value);
			}
			break;

		case "append":
			if (Array.isArray(current)) {
				// For arrays, we always append to maintain CRDT properties
				current.push(operation.value);
			}
			break;

		case "merge":
			if (isPlainObject(current) && isPlainObject(operation.value)) {
				Object.assign(current, operation.value);
			} else {
				setValueAtPath<T>(draft, operation.path, operation.value);
			}
			break;

		case "replace":
			setValueAtPath<T>(draft, operation.path, operation.value);
			break;
	}
}

function applyStandardPatch<T = unknown>(draft: T, patch: StandardPatch): void {
	switch (patch.op) {
		case "replace":
			if (patch.value !== undefined) {
				setValueAtPath<T>(draft, patch.path, patch.value);
			}
			break;

		case "add":
			if (patch.value !== undefined) {
				setValueAtPath<T>(draft, patch.path, patch.value);
			}
			break;

		case "remove":
			removeValueAtPath<T>(draft, patch.path);
			break;
	}
}

export function resolveConflicts(patches: EnhancedPatch[]): EnhancedPatch[] {
	const pathGroups = new Map<string, EnhancedPatch[]>();

	// Group patches by path
	for (const patch of patches) {
		const path = patch.path;
		if (!pathGroups.has(path)) {
			pathGroups.set(path, []);
		}
		pathGroups.get(path)?.push(patch);
	}

	const resolvedPatches: EnhancedPatch[] = [];

	for (const [_path, groupPatches] of pathGroups) {
		if (groupPatches.length === 1) {
			resolvedPatches.push(groupPatches[0]);
			continue;
		}

		// Handle conflicts for the same path
		const crdtOps = groupPatches.filter(
			(p) => "type" in p && p.type === "crdt",
		) as CRDTOperation[];
		const standardOps = groupPatches.filter(
			(p) => !("type" in p),
		) as StandardPatch[];

		// CRDT operations on the same path
		if (crdtOps.length > 0) {
			const resolved = resolveCRDTConflicts(crdtOps);
			resolvedPatches.push(...resolved);
		}

		// Standard operations - use HLC ordering if available, otherwise last
		if (standardOps.length > 0) {
			resolvedPatches.push(standardOps[standardOps.length - 1]);
		}
	}

	return resolvedPatches;
}

function resolveCRDTConflicts(operations: CRDTOperation[]): CRDTOperation[] {
	const increments = operations.filter((op) => op.op === "increment");
	const decrements = operations.filter((op) => op.op === "decrement");
	const appends = operations.filter((op) => op.op === "append");
	const others = operations.filter(
		(op) => !["increment", "decrement", "append"].includes(op.op),
	);

	const resolved: CRDTOperation[] = [];

	// Merge all increments into one
	if (increments.length > 0) {
		const totalIncrement = increments.reduce((sum, op) => {
			return typeof op.value === "number" ? sum + op.value : sum;
		}, 0);
		if (totalIncrement !== 0) {
			resolved.push({
				...increments[0],
				value: totalIncrement,
				hlc: increments.reduce((latest, current) => {
					const latestHlc = fromString(latest.hlc);
					const currentHlc = fromString(current.hlc);
					return compare(currentHlc, latestHlc) > 0 ? current : latest;
				}).hlc,
			});
		}
	}

	// Merge all decrements into one
	if (decrements.length > 0) {
		const totalDecrement = decrements.reduce((sum, op) => {
			return typeof op.value === "number" ? sum + op.value : sum;
		}, 0);
		if (totalDecrement !== 0) {
			resolved.push({
				...decrements[0],
				value: totalDecrement,
				hlc: decrements.reduce((latest, current) => {
					const latestHlc = fromString(latest.hlc);
					const currentHlc = fromString(current.hlc);
					return compare(currentHlc, latestHlc) > 0 ? current : latest;
				}).hlc,
			});
		}
	}

	// All append operations should be preserved and applied in HLC order
	if (appends.length > 0) {
		const sortedAppends = appends.sort((a, b) => {
			const hlcA = fromString(a.hlc);
			const hlcB = fromString(b.hlc);
			return compare(hlcA, hlcB);
		});
		resolved.push(...sortedAppends);
	}

	// For other operations, use HLC ordering (last writer wins)
	if (others.length > 0) {
		const latest = others.reduce((latest, current) => {
			const latestHlc = fromString(latest.hlc);
			const currentHlc = fromString(current.hlc);
			return compare(currentHlc, latestHlc) > 0 ? current : latest;
		});
		resolved.push(latest);
	}

	return resolved;
}

// Utility functions
function getValueAtPath<T = unknown>(obj: T, path: string): unknown {
	if (path === "" || path === "/") return obj;

	const parts = path.split("/").filter(Boolean);
	// biome-ignore lint/suspicious/noExplicitAny: (TODO) Handle this better
	let current: any = obj;

	for (const part of parts) {
		if (current == null) return undefined;
		current = current[part];
	}

	return current;
}

function setValueAtPath<T = unknown>(
	obj: T,
	path: string,
	value: PatchValue,
): void {
	if (path === "" || path === "/") {
		throw new Error("Cannot replace root object");
	}

	const parts = path.split("/").filter(Boolean);
	// biome-ignore lint/suspicious/noExplicitAny: (TODO) Handle this better
	let current: any = obj;

	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (current[part] == null) {
			current[part] = {};
		}
		current = current[part];
	}

	current[parts[parts.length - 1]] = value;
}

function removeValueAtPath<T = unknown>(obj: T, path: string): void {
	if (path === "" || path === "/") {
		throw new Error("Cannot remove root object");
	}

	const parts = path.split("/").filter(Boolean);
	// biome-ignore lint/suspicious/noExplicitAny: (TODO) Handle this better
	let current: any = obj;

	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (current[part] == null) return;
		current = current[part];
	}

	const lastPart = parts[parts.length - 1];
	if (Array.isArray(current)) {
		current.splice(parseInt(lastPart), 1);
	} else {
		delete current[lastPart];
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return (
		value != null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}
