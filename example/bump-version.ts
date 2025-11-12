#!/usr/bin/env bun
import { join } from "node:path";

const rootDir = join(import.meta.dir, "..");
const packageJsonPath = join(rootDir, "package.json");
const jsrJsonPath = join(rootDir, "jsr.json");

type BumpType = "major" | "minor" | "patch";

function parseVersion(version: string): [number, number, number] {
	const parts = version.split(".").map(Number);
	if (parts.length !== 3 || parts.some(Number.isNaN)) {
		throw new Error(`Invalid version format: ${version}`);
	}
	return [parts[0], parts[1], parts[2]];
}

function bumpVersion(version: string, type: BumpType): string {
	const [major, minor, patch] = parseVersion(version);

	switch (type) {
		case "major":
			return `${major + 1}.0.0`;
		case "minor":
			return `${major}.${minor + 1}.0`;
		case "patch":
			return `${major}.${minor}.${patch + 1}`;
	}
}

async function updateJsonFile(
	filePath: string,
	newVersion: string,
): Promise<void> {
	const file = Bun.file(filePath);
	const content = await file.json();
	content.version = newVersion;
	await Bun.write(filePath, `${JSON.stringify(content, null, "\t")}\n`);
}

async function main() {
	const args = process.argv.slice(2);
	const bumpType = (args[0] || "patch") as BumpType;

	if (!["major", "minor", "patch"].includes(bumpType)) {
		console.error(
			'Usage: bun run bump-version.ts [major|minor|patch]\nDefaults to "patch" if no argument provided.',
		);
		process.exit(1);
	}

	// Read current version from package.json
	const packageJson = await Bun.file(packageJsonPath).json();
	const currentVersion = packageJson.version;

	if (!currentVersion) {
		console.error("No version found in package.json");
		process.exit(1);
	}

	const newVersion = bumpVersion(currentVersion, bumpType);

	console.log(`Bumping version from ${currentVersion} to ${newVersion}`);

	// Update both files
	await updateJsonFile(packageJsonPath, newVersion);
	console.log(`✓ Updated ${packageJsonPath}`);

	await updateJsonFile(jsrJsonPath, newVersion);
	console.log(`✓ Updated ${jsrJsonPath}`);

	console.log(`\n✨ Successfully bumped ${bumpType} version to ${newVersion}`);
}

main().catch((error) => {
	console.error("Error:", error.message);
	process.exit(1);
});
