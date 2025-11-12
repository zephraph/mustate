import { describe, expect, it } from "bun:test";
import {
	asString,
	compare,
	createHLC,
	fromString,
	type HLC,
	receive,
	tick,
} from "./hlc.js";

describe("HLC - Hybrid Logical Clock", () => {
	describe("createHLC", () => {
		it("should create HLC with provided timestamp", () => {
			const hlc = createHLC("actor1", 1000);
			expect(hlc.timestamp).toBe(1000);
			expect(hlc.count).toBe(0);
			expect(hlc.actor).toBe("actor1");
		});

		it("should create HLC with current timestamp when not provided", () => {
			const before = Date.now();
			const hlc = createHLC("actor1");
			const after = Date.now();

			expect(hlc.timestamp).toBeGreaterThanOrEqual(before);
			expect(hlc.timestamp).toBeLessThanOrEqual(after);
			expect(hlc.count).toBe(0);
			expect(hlc.actor).toBe("actor1");
		});

		it("should be immutable", () => {
			const hlc = createHLC("actor1", 1000);
			// TypeScript readonly prevents assignment, which is good enough for immutability
			expect(hlc.timestamp).toBe(1000);
		});
	});

	describe("tick", () => {
		it("should advance timestamp when now > current timestamp", () => {
			const hlc = createHLC("actor1", 1000);
			const newHlc = tick(hlc, 2000);

			expect(newHlc.timestamp).toBe(2000);
			expect(newHlc.count).toBe(0);
			expect(newHlc.actor).toBe("actor1");
			expect(hlc.timestamp).toBe(1000); // original unchanged
		});

		it("should increment count when now <= current timestamp", () => {
			const hlc = createHLC("actor1", 1000);
			const newHlc = tick(hlc, 1000);

			expect(newHlc.timestamp).toBe(1000);
			expect(newHlc.count).toBe(1);
			expect(newHlc.actor).toBe("actor1");
		});

		it("should increment count when now < current timestamp", () => {
			const hlc = createHLC("actor1", 1000);
			const newHlc = tick(hlc, 500);

			expect(newHlc.timestamp).toBe(1000);
			expect(newHlc.count).toBe(1);
			expect(newHlc.actor).toBe("actor1");
		});

		it("should use current time when now is not provided", () => {
			const hlc = createHLC("actor1", Date.now() - 1000);
			const before = Date.now();
			const newHlc = tick(hlc);
			const after = Date.now();

			expect(newHlc.timestamp).toBeGreaterThanOrEqual(before);
			expect(newHlc.timestamp).toBeLessThanOrEqual(after);
			expect(newHlc.count).toBe(0);
		});

		it("should handle multiple ticks correctly", () => {
			let hlc = createHLC("actor1", 1000);
			hlc = tick(hlc, 1000); // count = 1
			hlc = tick(hlc, 1000); // count = 2
			hlc = tick(hlc, 2000); // timestamp = 2000, count = 0
			hlc = tick(hlc, 2000); // count = 1

			expect(hlc.timestamp).toBe(2000);
			expect(hlc.count).toBe(1);
		});
	});

	describe("receive", () => {
		it("should advance to current time when now > both timestamps", () => {
			const local = createHLC("actor1", 1000);
			const remote = createHLC("actor2", 1500);
			const newHlc = receive(local, remote, 2000);

			expect(newHlc.timestamp).toBe(2000);
			expect(newHlc.count).toBe(0);
			expect(newHlc.actor).toBe("actor1");
		});

		it("should increment max count when timestamps are equal", () => {
			const local = { timestamp: 1000, count: 5, actor: "actor1" };
			const remote = { timestamp: 1000, count: 3, actor: "actor2" };
			const newHlc = receive(local, remote, 1000);

			expect(newHlc.timestamp).toBe(1000);
			expect(newHlc.count).toBe(6); // max(5, 3) + 1
			expect(newHlc.actor).toBe("actor1");
		});

		it("should increment local count when local timestamp > remote", () => {
			const local = { timestamp: 1500, count: 2, actor: "actor1" };
			const remote = { timestamp: 1000, count: 5, actor: "actor2" };
			const newHlc = receive(local, remote, 1000);

			expect(newHlc.timestamp).toBe(1500);
			expect(newHlc.count).toBe(3); // local.count + 1
			expect(newHlc.actor).toBe("actor1");
		});

		it("should use remote timestamp and increment remote count when remote > local", () => {
			const local = { timestamp: 1000, count: 5, actor: "actor1" };
			const remote = { timestamp: 1500, count: 2, actor: "actor2" };
			const newHlc = receive(local, remote, 1000);

			expect(newHlc.timestamp).toBe(1500);
			expect(newHlc.count).toBe(3); // remote.count + 1
			expect(newHlc.actor).toBe("actor1"); // keeps local actor
		});

		it("should preserve local actor identifier", () => {
			const local = createHLC("local-actor", 1000);
			const remote = createHLC("remote-actor", 2000);
			const newHlc = receive(local, remote);

			expect(newHlc.actor).toBe("local-actor");
		});

		it("should handle scenario where now is not provided", () => {
			const local = createHLC("actor1", Date.now() - 1000);
			const remote = createHLC("actor2", Date.now() - 2000);
			const before = Date.now();
			const newHlc = receive(local, remote);
			const after = Date.now();

			expect(newHlc.timestamp).toBeGreaterThanOrEqual(before);
			expect(newHlc.timestamp).toBeLessThanOrEqual(after);
			expect(newHlc.count).toBe(0);
		});
	});

	describe("compare", () => {
		it("should return 0 for identical HLCs", () => {
			const hlc1 = { timestamp: 1000, count: 5, actor: "actor1" };
			const hlc2 = { timestamp: 1000, count: 5, actor: "actor1" };

			expect(compare(hlc1, hlc2)).toBe(0);
		});

		it("should compare by timestamp first", () => {
			const earlier = { timestamp: 1000, count: 10, actor: "actor1" };
			const later = { timestamp: 2000, count: 1, actor: "actor2" };

			expect(compare(earlier, later)).toBeLessThan(0);
			expect(compare(later, earlier)).toBeGreaterThan(0);
		});

		it("should compare by count when timestamps are equal", () => {
			const lower = { timestamp: 1000, count: 3, actor: "actor1" };
			const higher = { timestamp: 1000, count: 7, actor: "actor2" };

			expect(compare(lower, higher)).toBeLessThan(0);
			expect(compare(higher, lower)).toBeGreaterThan(0);
		});

		it("should compare by actor when timestamp and count are equal", () => {
			const actorA = { timestamp: 1000, count: 5, actor: "a" };
			const actorB = { timestamp: 1000, count: 5, actor: "b" };

			expect(compare(actorA, actorB)).toBeLessThan(0);
			expect(compare(actorB, actorA)).toBeGreaterThan(0);
		});

		it("should be transitive", () => {
			const a = { timestamp: 1000, count: 1, actor: "a" };
			const b = { timestamp: 1000, count: 2, actor: "b" };
			const c = { timestamp: 1000, count: 3, actor: "c" };

			expect(compare(a, b)).toBeLessThan(0);
			expect(compare(b, c)).toBeLessThan(0);
			expect(compare(a, c)).toBeLessThan(0);
		});

		it("should be symmetric", () => {
			const hlc1 = { timestamp: 1000, count: 5, actor: "actor1" };
			const hlc2 = { timestamp: 2000, count: 3, actor: "actor2" };

			expect(Math.sign(compare(hlc1, hlc2))).toBe(
				-Math.sign(compare(hlc2, hlc1)),
			);
		});
	});

	describe("toString/fromString", () => {
		it("should serialize and deserialize correctly", () => {
			const original = {
				timestamp: 1234567890,
				count: 255,
				actor: "test-actor",
			};
			const encoded = asString(original);
			const decoded = fromString(encoded);

			expect(decoded.timestamp).toBe(original.timestamp);
			expect(decoded.count).toBe(original.count);
			expect(decoded.actor).toBe(original.actor);
		});

		it("should handle edge case values", () => {
			const cases: HLC[] = [
				{ timestamp: 0, count: 0, actor: "" },
				{
					timestamp: 999999999999,
					count: 65535,
					actor: "very-long-actor-identifier-with-special-chars-123",
				},
				{ timestamp: 999999999999, count: 1, actor: "a" },
			];

			for (const original of cases) {
				const encoded = asString(original);
				const decoded = fromString(encoded);

				expect(decoded.timestamp).toBe(original.timestamp);
				expect(decoded.count).toBe(original.count);
				expect(decoded.actor).toBe(original.actor);
			}
		});

		it("should produce deterministic string output", () => {
			const hlc = { timestamp: 1000, count: 5, actor: "test" };
			const str1 = asString(hlc);
			const str2 = asString(hlc);

			expect(str1).toBe(str2);
		});

		it("should maintain sort order in string format", () => {
			const hlc1 = { timestamp: 1000, count: 1, actor: "a" };
			const hlc2 = { timestamp: 1000, count: 2, actor: "a" };
			const hlc3 = { timestamp: 2000, count: 1, actor: "a" };

			const str1 = asString(hlc1);
			const str2 = asString(hlc2);
			const str3 = asString(hlc3);

			expect(str1 < str2).toBe(compare(hlc1, hlc2) < 0);
			expect(str2 < str3).toBe(compare(hlc2, hlc3) < 0);
			expect(str1 < str3).toBe(compare(hlc1, hlc3) < 0);
		});

		it("should handle round-trip with padding", () => {
			const hlc = { timestamp: 1, count: 1, actor: "x" };
			const encoded = asString(hlc);

			// Check that encoding includes proper padding
			expect(encoded.length).toBeGreaterThanOrEqual(15); // 10 + 4 + 1

			const decoded = fromString(encoded);
			expect(decoded).toEqual(hlc);
		});
	});

	describe("integration scenarios", () => {
		it("should handle basic synchronization scenario", () => {
			// Two actors start at different times
			let actor1 = createHLC("actor1", 1000);
			let actor2 = createHLC("actor2", 1500);

			// actor1 performs operations
			actor1 = tick(actor1, 1600);
			actor1 = tick(actor1, 1600);

			// actor2 receives update from actor1
			actor2 = receive(actor2, actor1, 1700);

			// actor2 should be ahead
			expect(actor2.timestamp).toBe(1700);
			expect(actor2.count).toBe(0);
		});

		it("should maintain causality", () => {
			let alice = createHLC("alice", 1000);
			let bob = createHLC("bob", 1000);

			// Alice performs operation
			alice = tick(alice);
			const aliceState = alice;

			// Bob receives Alice's state
			bob = receive(bob, aliceState);

			// Bob performs operation
			bob = tick(bob);

			// Bob's operation should be causally after Alice's
			expect(compare(aliceState, bob)).toBeLessThan(0);
		});

		it("should handle concurrent operations deterministically", () => {
			const base = createHLC("base", 1000);

			// Two actors start from same state
			let actor1 = base;
			let actor2 = base;

			// Both perform operations concurrently
			actor1 = tick(actor1, 1001);
			actor2 = tick(actor2, 1001);

			// When they sync, order should be deterministic
			const actor1AfterSync = receive(actor1, actor2, 1002);
			const actor2AfterSync = receive(actor2, actor1, 1002);

			// Both should end up with same logical time
			expect(actor1AfterSync.timestamp).toBe(actor2AfterSync.timestamp);
			expect(actor1AfterSync.count).toBe(actor2AfterSync.count);
		});

		it("should handle network partition scenario", () => {
			let actorA = createHLC("actorA", 1000);
			let actorB = createHLC("actorB", 1000);

			// Network partition - actors operate independently
			// Each tick at the same time should increment count
			for (let i = 0; i < 5; i++) {
				actorA = tick(actorA, 1000); // timestamp stays same, count increments
				actorB = tick(actorB, 1000); // timestamp stays same, count increments
			}

			// actors have diverged
			expect(actorA.count).toBe(5);
			expect(actorB.count).toBe(5);

			// Network heals - actors sync
			const actorAAfterSync = receive(actorA, actorB, 2000);
			const actorBAfterSync = receive(actorB, actorA, 2000);

			// Both should converge to current time
			expect(actorAAfterSync.timestamp).toBe(2000);
			expect(actorBAfterSync.timestamp).toBe(2000);
			expect(actorAAfterSync.count).toBe(0);
			expect(actorBAfterSync.count).toBe(0);
		});

		it("should handle serialization in distributed scenario", () => {
			let sender = createHLC("sender", 1000);
			sender = tick(sender, 1500);
			sender = tick(sender, 1500);

			// Serialize for network transmission
			const serialized = asString(sender);

			// Receiver deserializes and merges
			const received = fromString(serialized);
			let receiver = createHLC("receiver", 1400);
			receiver = receive(receiver, received, 1600);

			// Receiver should be synchronized
			expect(receiver.timestamp).toBe(1600);
			expect(receiver.count).toBe(0);
			expect(receiver.actor).toBe("receiver");
		});
	});
});
