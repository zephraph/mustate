declare const tag: unique symbol;

/**
 * A branded string type for encoded HLC values.
 * This ensures type safety by preventing regular strings from being used where HLC strings are expected.
 */
export type HLCString = string & { readonly [tag]: unique symbol };

/**
 * Hybrid Logical Clock (Functional Implementation)
 *
 * HLCs provide a way to order events in a distributed system without requiring
 * synchronized clocks between nodes. They combine physical timestamps with
 * logical counters to create a total ordering of events.
 *
 * Key properties:
 * - Events within the same process are ordered by the logical counter
 * - Events from different processes are ordered by physical time when possible
 * - Maintains causality relationships between events
 * - Provides deterministic ordering across distributed nodes
 *
 * @see https://jaredforsyth.com/posts/hybrid-logical-clocks/
 * @see https://cse.buffalo.edu/tech-reports/2014-04.pdf (Original HLC paper)
 */
export interface HLC {
	/**
	 * Physical timestamp in milliseconds since Unix epoch.
	 * Represents the wall clock time when this HLC was created or last updated.
	 * Used as the primary ordering mechanism when events occur far apart in time.
	 */
	readonly timestamp: number;

	/**
	 * Logical counter that increments for events within the same timestamp.
	 * Used to order events that happen at the same physical time or when
	 * receiving messages from the future. Ensures causality is preserved
	 * even when physical clocks are not perfectly synchronized.
	 */
	readonly count: number;

	/**
	 * Unique identifier for the actor (node/process) that created this HLC.
	 * Used as a tiebreaker when both timestamp and count are equal,
	 * ensuring deterministic total ordering across all events in the system.
	 * Should be unique across all nodes in the distributed system.
	 */
	readonly actor: string;
}

// Constants for encoding/decoding
const TS_LENGTH = 10;
const TS_BASE = 36;
const COUNT_LENGTH = 4;
const COUNT_BASE = 16;

/**
 * Create a new Hybrid Logical Clock
 *
 * @param actor - Client identifier
 * @param now - Current timestamp
 * @returns A new HLC instance
 */
export function createHLC(actor: string, now: number = Date.now()): HLC {
	return {
		timestamp: now,
		count: 0,
		actor,
	};
}

/**
 * Advance the logical clock
 *
 * @param hlc - The current HLC
 * @param now - Current timestamp
 * @returns A new HLC with advanced time
 */
export function tick(hlc: HLC, now: number = Date.now()): HLC {
	if (now > hlc.timestamp) {
		return {
			timestamp: now,
			count: 0,
			actor: hlc.actor,
		};
	} else {
		return {
			timestamp: hlc.timestamp,
			count: hlc.count + 1,
			actor: hlc.actor,
		};
	}
}

/**
 * Merge with a remote HLC
 *
 * @param local - The local HLC
 * @param remote - Remote HLC
 * @param now - Current timestamp
 * @returns A new HLC with merged state
 */
export function receive(
	local: HLC,
	remote: HLC,
	now: number = Date.now(),
): HLC {
	// If current timestamp is ahead, just update timestamp
	if (now > local.timestamp && now > remote.timestamp) {
		return {
			timestamp: now,
			count: 0,
			actor: local.actor,
		};
	}

	if (local.timestamp === remote.timestamp) {
		// Clocks are the same, increment the largest count
		return {
			timestamp: local.timestamp,
			count: Math.max(local.count, remote.count) + 1,
			actor: local.actor,
		};
	} else if (local.timestamp > remote.timestamp) {
		// Local clock is ahead, increment local count
		return {
			timestamp: local.timestamp,
			count: local.count + 1,
			actor: local.actor,
		};
	} else {
		// Remote clock is ahead, increment remote count and use remote timestamp
		return {
			timestamp: remote.timestamp,
			count: remote.count + 1,
			actor: local.actor,
		};
	}
}

/**
 * Compare two HLCs
 *
 * @param a - First HLC
 * @param b - Second HLC
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function compare(a: HLC, b: HLC): number {
	if (a.timestamp === b.timestamp) {
		if (a.count === b.count) {
			if (a.actor === b.actor) {
				return 0;
			}
			return a.actor < b.actor ? -1 : 1;
		}
		return a.count - b.count;
	}
	return a.timestamp - b.timestamp;
}

/**
 * Serialize the HLC to a string
 *
 * @param hlc - The HLC to serialize
 * @returns Encoded HLC string
 */
export function asString(hlc: HLC): HLCString {
	const ts = hlc.timestamp.toString(TS_BASE).padStart(TS_LENGTH, "0");
	const count = hlc.count.toString(COUNT_BASE).padStart(COUNT_LENGTH, "0");
	return `${ts}${count}${hlc.actor}` as HLCString;
}

/**
 * Deserialize a string to an HLC
 *
 * @param encoded - The encoded string
 * @returns Decoded HLC instance
 */
export function fromString(encoded: HLCString): HLC {
	const ts = parseInt(encoded.slice(0, TS_LENGTH), TS_BASE);
	const count = parseInt(
		encoded.slice(TS_LENGTH, TS_LENGTH + COUNT_LENGTH),
		COUNT_BASE,
	);
	const actor = encoded.slice(TS_LENGTH + COUNT_LENGTH);

	return {
		timestamp: ts,
		count,
		actor: actor,
	};
}
