/**
 * A path segment can be a string (object key) or number (array index)
 */
export type PathSegment = string | number;

/**
 * A path is an array of segments, e.g., ["user", "profile", "age"] or ["items", 0]
 */
export type Path = PathSegment[];

/**
 * A subscriber function that gets called when relevant paths change
 */
export type Subscriber<T = any> = (data: T) => void;

/**
 * Internal node structure for the trie
 */
class TrieNode<T> {
	children = new Map<PathSegment, TrieNode<T>>();
	subscribers = new Set<Subscriber<T>>();
}

/**
 * PathTrie provides efficient path-based subscriptions for nested state structures.
 *
 * Features:
 * - Subscribe to specific paths in the state tree
 * - Efficiently find all affected subscribers based on path operations
 * - Supports ancestor and descendant subscriber lookup
 *
 * @example
 * ```typescript
 * const trie = new PathTrie<PatchData>();
 *
 * // Subscribe to a specific path
 * const unsubscribe = trie.subscribe(["user", "profile", "age"], (data) => {
 *   console.log("Age changed:", data);
 * });
 *
 * // Find subscribers affected by a change
 * const affected = trie.getAffectedSubscribers(["user", "profile", "age"], "replace");
 * ```
 */
export class PathTrie<T = any> {
	private root = new TrieNode<T>();

	/**
	 * Subscribe to changes at a specific path
	 * @param path - The path to subscribe to (e.g., ["user", "profile", "age"])
	 * @param subscriber - The callback function to invoke on changes
	 * @returns A function to unsubscribe
	 */
	subscribe(path: Path, subscriber: Subscriber<T>): () => void {
		const node = this.ensureNode(path);
		node.subscribers.add(subscriber);

		return () => {
			node.subscribers.delete(subscriber);
		};
	}

	/**
	 * Get all subscribers that should be notified for a given path operation
	 *
	 * @param path - The path that changed
	 * @param operation - The type of operation: "add", "remove", or "replace"
	 * @returns A Set of all subscribers that should be notified
	 *
	 * Notification rules:
	 * - "add" / "replace": Notifies subscribers to the exact path and all ancestors
	 * - "remove": Notifies subscribers to the exact path, all descendants, and all ancestors
	 */
	getAffectedSubscribers(
		path: Path,
		operation: "add" | "remove" | "replace",
	): Set<Subscriber<T>> {
		const affected = new Set<Subscriber<T>>();

		// Always notify ancestors (they care about changes in their subtree)
		this.collectAncestorSubscribers(path, affected);

		// Always notify exact path subscribers
		const exactNode = this.findNode(path);
		if (exactNode) {
			for (const sub of exactNode.subscribers) {
				affected.add(sub);
			}
		}

		// For remove operations, also notify all descendants
		if (operation === "remove" && exactNode) {
			this.collectDescendantSubscribers(exactNode, affected);
		}

		return affected;
	}

	/**
	 * Collect all subscribers from ancestor nodes (walking up the tree)
	 * @param path - The path to start from
	 * @param result - The set to add subscribers to
	 */
	private collectAncestorSubscribers(
		path: Path,
		result: Set<Subscriber<T>>,
	): void {
		let node = this.root;

		// Add root subscribers
		for (const sub of node.subscribers) {
			result.add(sub);
		}

		// Walk down the path, collecting subscribers from each ancestor
		for (const segment of path) {
			const child = node.children.get(segment);
			if (!child) break;

			for (const sub of child.subscribers) {
				result.add(sub);
			}

			node = child;
		}
	}

	/**
	 * Collect all subscribers from descendant nodes (walking down the tree)
	 * @param node - The node to start from
	 * @param result - The set to add subscribers to
	 */
	private collectDescendantSubscribers(
		node: TrieNode<T>,
		result: Set<Subscriber<T>>,
	): void {
		// Don't add the current node's subscribers - they're already added by the caller

		// Recursively collect from all children
		for (const child of node.children.values()) {
			for (const sub of child.subscribers) {
				result.add(sub);
			}
			this.collectDescendantSubscribers(child, result);
		}
	}

	/**
	 * Find or create a node at the given path
	 * @param path - The path to navigate to
	 * @returns The node at the path
	 */
	private ensureNode(path: Path): TrieNode<T> {
		let node = this.root;

		for (const segment of path) {
			let child = node.children.get(segment);
			if (!child) {
				child = new TrieNode<T>();
				node.children.set(segment, child);
			}
			node = child;
		}

		return node;
	}

	/**
	 * Find a node at the given path (without creating it)
	 * @param path - The path to navigate to
	 * @returns The node at the path, or undefined if it doesn't exist
	 */
	private findNode(path: Path): TrieNode<T> | undefined {
		let node: TrieNode<T> | undefined = this.root;

		for (const segment of path) {
			if (!node) return undefined;
			node = node.children.get(segment);
		}

		return node;
	}

	/**
	 * Get the total number of subscribers across all paths
	 * Useful for debugging and testing
	 */
	getSubscriberCount(): number {
		return this.countSubscribers(this.root);
	}

	private countSubscribers(node: TrieNode<T>): number {
		let count = node.subscribers.size;
		for (const child of node.children.values()) {
			count += this.countSubscribers(child);
		}
		return count;
	}

	/**
	 * Clear all subscriptions
	 * Useful for cleanup and testing
	 */
	clear(): void {
		this.root = new TrieNode<T>();
	}
}
