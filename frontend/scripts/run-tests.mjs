import { spawnSync } from "node:child_process";

const serialTestFiles = [
  "src/features/experiments/experiment-files-page.test.tsx",
  "src/features/experiments/experiment-list-page.test.tsx",
  "src/features/experiments/experiment-state-actions.test.tsx",
  "src/features/recipes/recipe-admin-page.test.tsx",
];

const forkPoolTestFiles = ["src/features/experiments/experiment-editor-page.test.tsx"];
const parallelExcludedFiles = [...serialTestFiles, ...forkPoolTestFiles];

const parallelArgs = [
  "--fileParallelism=true",
  ...parallelExcludedFiles.flatMap((file) => ["--exclude", file]),
];

const serialArgs = ["--no-file-parallelism", ...serialTestFiles];
const forkPoolArgs = [
  "--no-file-parallelism",
  "--pool=forks",
  "--reporter=verbose",
  ...forkPoolTestFiles,
];

function hasOption(args, optionName) {
  return args.some((arg) => arg === optionName || arg.startsWith(`${optionName}=`));
}

function includesAnyFile(args, files) {
  return files.some((file) =>
    args.some((arg) => {
      const normalizedArg = arg.replaceAll("\\", "/");
      return normalizedArg === file || normalizedArg.endsWith(`/${file}`);
    }),
  );
}

function withForkPoolForLongFiles(args) {
  if (!includesAnyFile(args, forkPoolTestFiles)) {
    return args;
  }

  const nextArgs = [...args];
  if (!hasOption(nextArgs, "--pool")) {
    nextArgs.unshift("--pool=forks");
  }
  if (!hasOption(nextArgs, "--reporter")) {
    nextArgs.unshift("--reporter=verbose");
  }
  return nextArgs;
}

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
  process.exit(runVitest(withForkPoolForLongFiles(args)));
}

const parallelStatus = runVitest(parallelArgs);
if (parallelStatus !== 0) {
  process.exit(parallelStatus);
}

const serialStatus = runVitest(serialArgs);
if (serialStatus !== 0) {
  process.exit(serialStatus);
}

process.exit(runVitest(forkPoolArgs));
