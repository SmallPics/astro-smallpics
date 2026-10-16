import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('exposes generated declarations to TypeScript consumers', () => {
	execFileSync(
		process.execPath,
		[
			fileURLToPath(
				new URL('../node_modules/typescript/bin/tsc', import.meta.url),
			),
			'--noEmit',
			'--strict',
			'--module',
			'NodeNext',
			'--target',
			'ES2022',
			'--skipLibCheck',
			'--ignoreConfig',
			'tests/types/consumer.ts',
		],
		{ cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8' },
	);
});
