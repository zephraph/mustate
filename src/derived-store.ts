import type { Path, Subscriber } from "./path-trie";
import type { Store } from "./store";
import type {
	Store as IStore,
	PatchNotification,
	StateType,
	UpdaterFn,
	GetAtPath,
} from "./types";

export class DerivedStore<
	ParentState extends StateType,
	SelectedPath extends Path,
	SubState extends StateType = GetAtPath<
		ParentState,
		SelectedPath
	> extends StateType
		? GetAtPath<ParentState, SelectedPath>
		: never,
> implements IStore<SubState>
{
	constructor(
		private parent: Store<ParentState>,
		private path: SelectedPath,
	) {}

	get(): Readonly<SubState> {
		const parentState = this.parent.get();
		let current: any = parentState;

		for (const segment of this.path) {
			current = current[segment];
			if (current === undefined) {
				throw new Error(
					`Path ${JSON.stringify(this.path)} does not exist in state`,
				);
			}
		}

		return current as Readonly<SubState>;
	}

	set(nextState: SubState): void;
	set(updater: UpdaterFn<SubState>): void;
	set(nextState: SubState | UpdaterFn<SubState>): void {
		if (typeof nextState === "function") {
			// Functional update: need to navigate to the path and apply the updater
			this.parent.set((draft) => {
				let current: any = draft;

				// Navigate to the parent of our target
				for (let i = 0; i < this.path.length - 1; i++) {
					current = current[this.path[i]];
				}

				// Apply the updater function to the target
				const lastSegment = this.path[this.path.length - 1];
				if (this.path.length === 0) {
					// Root path - apply to entire draft
					nextState(draft as any);
				} else {
					// Apply updater to the specific sub-object
					nextState(current[lastSegment]);
				}
			});
		} else {
			// Direct value update
			this.parent.set((draft) => {
				let current: any = draft;

				// Navigate to the parent of our target
				for (let i = 0; i < this.path.length - 1; i++) {
					current = current[this.path[i]];
				}

				// Set the value at the target path
				const lastSegment = this.path[this.path.length - 1];
				if (this.path.length === 0) {
					// Root path - replace entire state
					Object.assign(draft, nextState);
				} else {
					current[lastSegment] = nextState;
				}
			});
		}
	}

	subscribe(subscriber: Subscriber<PatchNotification>): () => void;
	subscribe(
		relativePath: Path,
		subscriber: Subscriber<PatchNotification>,
	): () => void;

	subscribe(
		pathOrSubscriber: Path | Subscriber<PatchNotification>,
		maybeSubscriber?: Subscriber<PatchNotification>,
	): () => void {
		// Determine if this is a global or path-based subscription
		if (typeof pathOrSubscriber === "function") {
			// Global subscription for this derived store - subscribe to our base path
			return this.parent.subscribe(this.path, pathOrSubscriber);
		}

		// Path-based subscription - combine our base path with the relative path
		const relativePath = pathOrSubscriber;
		const absolutePath = [...this.path, ...relativePath];

		if (!maybeSubscriber) {
			throw new Error(
				"Subscriber function is required for path-based subscriptions",
			);
		}

		return this.parent.subscribe(absolutePath, maybeSubscriber);
	}

	select<P extends Path>(
		path: P,
	): GetAtPath<SubState, P> extends StateType
		? IStore<GetAtPath<SubState, P>>
		: never {
		const absolutePath = [...this.path, ...path] as [...SelectedPath, ...P];
		return new DerivedStore(this.parent, absolutePath) as any;
	}
}
