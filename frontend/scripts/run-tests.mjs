import { spawnSync } from "node:child_process";

const serialTestFiles = [
  "src/features/experiments/experiment-files-page.test.tsx",
  "src/features/experiments/experiment-list-page.test.tsx",
  "src/features/experiments/experiment-state-actions.test.tsx",
  "src/features/recipes/recipe-admin-page.test.tsx",
];

const parallelArgs = [
  "--fileParallelism=true",
  ...serialTestFiles.flatMap((file) => ["--exclude", file]),
];

const serialArgs = ["--no-file-parallelism", ...serialTestFiles];

function runVitest(args) {
  const result = spawnSync("bun", ["x", "vitest", "run", ...args], {
    stdio: "inherit",
  });

  return result.status ?? 1;
}

const args = process.argv.slice(2);
const mode = args[0];

if (mode === "--parallel-suite") {
  process.exit(runVitest([...parallelArgs, ...args.slice(1)]));
}

if (mode === "--serial-suite") {
  process.exit(runVitest([...serialArgs, ...args.slice(1)]));
}

if (args.length > 0) {
  process.exit(runVitest(args));
}

const parallelStatus = runVitest(parallelArgs);
if (parallelStatus !== 0) {
  process.exit(parallelStatus);
}

process.exit(runVitest(serialArgs));
