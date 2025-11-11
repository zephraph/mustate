import { PathTrie } from "./path-trie";

describe("PathTrie", () => {
	let trie: PathTrie;

	beforeEach(() => {
		trie = new PathTrie();
	});

	describe("subscribe", () => {
		test("should subscribe to a path", () => {
			const callback = () => {};
			const unsubscribe = trie.subscribe(["user", "name"], callback);

			expect(typeof unsubscribe).toBe("function");
			expect(trie.getSubscriberCount()).toBe(1);
		});

		test("should handle multiple subscribers to the same path", () => {
			const callback1 = () => {};
			const callback2 = () => {};

			trie.subscribe(["user", "name"], callback1);
			trie.subscribe(["user", "name"], callback2);

			expect(trie.getSubscriberCount()).toBe(2);
		});

		test("should handle subscribers to different paths", () => {
			const callback1 = () => {};
			const callback2 = () => {};

			trie.subscribe(["user", "name"], callback1);
			trie.subscribe(["user", "age"], callback2);

			expect(trie.getSubscriberCount()).toBe(2);
		});

		test("should handle empty path (root subscription)", () => {
			const callback = () => {};
			trie.subscribe([], callback);

			expect(trie.getSubscriberCount()).toBe(1);
		});

		test("should handle numeric path segments (array indices)", () => {
			const callback = () => {};
			trie.subscribe(["items", 0], callback);

			expect(trie.getSubscriberCount()).toBe(1);
		});
	});

	describe("unsubscribe", () => {
		test("should remove subscriber when unsubscribe is called", () => {
			const callback = () => {};
			const unsubscribe = trie.subscribe(["user", "name"], callback);

			expect(trie.getSubscriberCount()).toBe(1);

			unsubscribe();

			expect(trie.getSubscriberCount()).toBe(0);
		});

		test("should only remove the specific subscriber", () => {
			const callback1 = () => {};
			const callback2 = () => {};

			const unsubscribe1 = trie.subscribe(["user", "name"], callback1);
			trie.subscribe(["user", "name"], callback2);

			expect(trie.getSubscriberCount()).toBe(2);

			unsubscribe1();

			expect(trie.getSubscriberCount()).toBe(1);
		});

		test("should be safe to call unsubscribe multiple times", () => {
			const callback = () => {};
			const unsubscribe = trie.subscribe(["user", "name"], callback);

			unsubscribe();
			unsubscribe();

			expect(trie.getSubscriberCount()).toBe(0);
		});
	});

	describe("getAffectedSubscribers - add operation", () => {
		test("should notify exact path subscriber", () => {
			const callback = () => {};
			trie.subscribe(["user", "name"], callback);

			const affected = trie.getAffectedSubscribers(["user", "name"], "add");

			expect(affected.has(callback)).toBe(true);
			expect(affected.size).toBe(1);
		});

		test("should notify ancestor subscribers", () => {
			const rootCallback = () => {};
			const userCallback = () => {};
			const nameCallback = () => {};

			trie.subscribe([], rootCallback);
			trie.subscribe(["user"], userCallback);
			trie.subscribe(["user", "name"], nameCallback);

			const affected = trie.getAffectedSubscribers(["user", "name"], "add");

			expect(affected.has(rootCallback)).toBe(true);
			expect(affected.has(userCallback)).toBe(true);
			expect(affected.has(nameCallback)).toBe(true);
			expect(affected.size).toBe(3);
		});

		test("should NOT notify descendant subscribers", () => {
			const userCallback = () => {};
			const profileCallback = () => {};
			const ageCallback = () => {};

			trie.subscribe(["user"], userCallback);
			trie.subscribe(["user", "profile"], profileCallback);
			trie.subscribe(["user", "profile", "age"], ageCallback);

			// Adding to ["user"] should not notify deeper paths
			const affected = trie.getAffectedSubscribers(["user"], "add");

			expect(affected.has(userCallback)).toBe(true);
			expect(affected.has(profileCallback)).toBe(false);
			expect(affected.has(ageCallback)).toBe(false);
		});

		test("should NOT notify sibling subscribers", () => {
			const nameCallback = () => {};
			const ageCallback = () => {};

			trie.subscribe(["user", "name"], nameCallback);
			trie.subscribe(["user", "age"], ageCallback);

			const affected = trie.getAffectedSubscribers(["user", "name"], "add");

			expect(affected.has(nameCallback)).toBe(true);
			expect(affected.has(ageCallback)).toBe(false);
		});

		test("should handle paths with no subscribers", () => {
			const affected = trie.getAffectedSubscribers(
				["nonexistent", "path"],
				"add",
			);

			expect(affected.size).toBe(0);
		});
	});

	describe("getAffectedSubscribers - replace operation", () => {
		test("should behave the same as add operation", () => {
			const rootCallback = () => {};
			const userCallback = () => {};
			const nameCallback = () => {};

			trie.subscribe([], rootCallback);
			trie.subscribe(["user"], userCallback);
			trie.subscribe(["user", "name"], nameCallback);

			const affected = trie.getAffectedSubscribers(["user", "name"], "replace");

			expect(affected.has(rootCallback)).toBe(true);
			expect(affected.has(userCallback)).toBe(true);
			expect(affected.has(nameCallback)).toBe(true);
			expect(affected.size).toBe(3);
		});
	});

	describe("getAffectedSubscribers - remove operation", () => {
		test("should notify exact path subscriber", () => {
			const callback = () => {};
			trie.subscribe(["user", "name"], callback);

			const affected = trie.getAffectedSubscribers(["user", "name"], "remove");

			expect(affected.has(callback)).toBe(true);
		});

		test("should notify ancestor subscribers", () => {
			const rootCallback = () => {};
			const userCallback = () => {};
			const profileCallback = () => {};

			trie.subscribe([], rootCallback);
			trie.subscribe(["user"], userCallback);
			trie.subscribe(["user", "profile"], profileCallback);

			const affected = trie.getAffectedSubscribers(
				["user", "profile"],
				"remove",
			);

			expect(affected.has(rootCallback)).toBe(true);
			expect(affected.has(userCallback)).toBe(true);
			expect(affected.has(profileCallback)).toBe(true);
		});

		test("should notify descendant subscribers", () => {
			const userCallback = () => {};
			const profileCallback = () => {};
			const ageCallback = () => {};
			const cityCallback = () => {};

			trie.subscribe(["user"], userCallback);
			trie.subscribe(["user", "profile"], profileCallback);
			trie.subscribe(["user", "profile", "age"], ageCallback);
			trie.subscribe(["user", "profile", "city"], cityCallback);

			// Removing ["user"] should notify all descendants
			const affected = trie.getAffectedSubscribers(["user"], "remove");

			expect(affected.has(userCallback)).toBe(true);
			expect(affected.has(profileCallback)).toBe(true);
			expect(affected.has(ageCallback)).toBe(true);
			expect(affected.has(cityCallback)).toBe(true);
		});

		test("should notify deeply nested descendants", () => {
			const level1Callback = () => {};
			const level2Callback = () => {};
			const level3Callback = () => {};
			const level4Callback = () => {};

			trie.subscribe(["a"], level1Callback);
			trie.subscribe(["a", "b"], level2Callback);
			trie.subscribe(["a", "b", "c"], level3Callback);
			trie.subscribe(["a", "b", "c", "d"], level4Callback);

			// Remove ["a", "b"]
			const affected = trie.getAffectedSubscribers(["a", "b"], "remove");

			expect(affected.has(level1Callback)).toBe(true); // ancestor
			expect(affected.has(level2Callback)).toBe(true); // exact
			expect(affected.has(level3Callback)).toBe(true); // descendant
			expect(affected.has(level4Callback)).toBe(true); // descendant
			expect(affected.size).toBe(4);
		});

		test("should NOT notify sibling subscribers", () => {
			const nameCallback = () => {};
			const ageCallback = () => {};

			trie.subscribe(["user", "name"], nameCallback);
			trie.subscribe(["user", "age"], ageCallback);

			const affected = trie.getAffectedSubscribers(["user", "name"], "remove");

			expect(affected.has(nameCallback)).toBe(true);
			expect(affected.has(ageCallback)).toBe(false);
		});

		test("should handle removal of non-existent paths", () => {
			const userCallback = () => {};
			trie.subscribe(["user"], userCallback);

			const affected = trie.getAffectedSubscribers(
				["nonexistent", "path"],
				"remove",
			);

			// Only notifies ancestors (none in this case)
			expect(affected.size).toBe(0);
		});
	});

	describe("complex scenarios", () => {
		test("should handle mixed path depths", () => {
			const callbacks = {
				root: () => {},
				user: () => {},
				userName: () => {},
				userProfile: () => {},
				userProfileAge: () => {},
				items: () => {},
				items0: () => {},
			};

			trie.subscribe([], callbacks.root);
			trie.subscribe(["user"], callbacks.user);
			trie.subscribe(["user", "name"], callbacks.userName);
			trie.subscribe(["user", "profile"], callbacks.userProfile);
			trie.subscribe(["user", "profile", "age"], callbacks.userProfileAge);
			trie.subscribe(["items"], callbacks.items);
			trie.subscribe(["items", 0], callbacks.items0);

			// Change user.profile.age (replace)
			const affected = trie.getAffectedSubscribers(
				["user", "profile", "age"],
				"replace",
			);

			expect(affected.has(callbacks.root)).toBe(true);
			expect(affected.has(callbacks.user)).toBe(true);
			expect(affected.has(callbacks.userName)).toBe(false);
			expect(affected.has(callbacks.userProfile)).toBe(true);
			expect(affected.has(callbacks.userProfileAge)).toBe(true);
			expect(affected.has(callbacks.items)).toBe(false);
			expect(affected.has(callbacks.items0)).toBe(false);
		});

		test("should handle removing a subtree with many descendants", () => {
			const callbacks = {
				user: () => {},
				profile: () => {},
				age: () => {},
				city: () => {},
				settings: () => {},
				theme: () => {},
			};

			trie.subscribe(["user"], callbacks.user);
			trie.subscribe(["user", "profile"], callbacks.profile);
			trie.subscribe(["user", "profile", "age"], callbacks.age);
			trie.subscribe(["user", "profile", "city"], callbacks.city);
			trie.subscribe(["user", "settings"], callbacks.settings);
			trie.subscribe(["user", "settings", "theme"], callbacks.theme);

			// Remove ["user", "profile"]
			const affected = trie.getAffectedSubscribers(
				["user", "profile"],
				"remove",
			);

			expect(affected.has(callbacks.user)).toBe(true); // ancestor
			expect(affected.has(callbacks.profile)).toBe(true); // exact
			expect(affected.has(callbacks.age)).toBe(true); // descendant
			expect(affected.has(callbacks.city)).toBe(true); // descendant
			expect(affected.has(callbacks.settings)).toBe(false); // sibling
			expect(affected.has(callbacks.theme)).toBe(false); // sibling descendant
		});
	});

	describe("clear", () => {
		test("should remove all subscriptions", () => {
			trie.subscribe(["user", "name"], () => {});
			trie.subscribe(["user", "age"], () => {});
			trie.subscribe(["items", 0], () => {});

			expect(trie.getSubscriberCount()).toBe(3);

			trie.clear();

			expect(trie.getSubscriberCount()).toBe(0);
		});
	});

	describe("edge cases", () => {
		test("should handle subscribing to the same path multiple times with the same callback", () => {
			const callback = () => {};

			trie.subscribe(["user", "name"], callback);
			trie.subscribe(["user", "name"], callback);

			// Sets don't allow duplicates
			expect(trie.getSubscriberCount()).toBe(1);
		});

		test("should handle deeply nested paths", () => {
			const callback = () => {};
			const deepPath = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

			trie.subscribe(deepPath, callback);

			const affected = trie.getAffectedSubscribers(deepPath, "replace");

			expect(affected.has(callback)).toBe(true);
		});

		test("should handle mixed string and numeric segments", () => {
			const callback = () => {};
			trie.subscribe(["users", 0, "posts", 5, "title"], callback);

			const affected = trie.getAffectedSubscribers(
				["users", 0, "posts", 5, "title"],
				"replace",
			);

			expect(affected.has(callback)).toBe(true);
		});
	});
});
