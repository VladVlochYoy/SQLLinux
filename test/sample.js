// Интеграционные тесты на приложенном журнале (1200 корректных + повреждённые строки)
// и на CLI как отдельном процессе.
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeFile } from "../src/analyzer.js";
import { createAggregator } from "../src/aggregator.js";
import { DEFAULT_LOG_PATH } from "../src/paths.js";

const run = promisify(execFile);
const CLI = new URL("../src/cli.js", import.meta.url).pathname;

test("образец: 1200 корректных записей, остальные строки повреждены, файл прочитан до конца", async () => {
  const report = await analyzeFile(DEFAULT_LOG_PATH);
  assert.equal(report.stats.validLines, 1200);
  assert.equal(report.stats.invalidLines, report.stats.totalLines - 1200);
  assert.ok(report.stats.invalidLines > 0);
  // У каждой ошибочной строки есть номер.
  assert.ok(report.invalidSamples.every((s) => Number.isInteger(s.lineNumber) && s.lineNumber > 0));
});

test("результат детерминирован (кроме generatedAt)", async () => {
  const strip = ({ generatedAt, ...rest }) => rest;
  assert.deepEqual(strip(await analyzeFile(DEFAULT_LOG_PATH)), strip(await analyzeFile(DEFAULT_LOG_PATH)));
});

test("top=0 даёт пустой рейтинг, неверный top — ошибку", async () => {
  assert.deepEqual((await analyzeFile(DEFAULT_LOG_PATH, { top: 0 })).topErrors, []);
  await assert.rejects(() => analyzeFile(DEFAULT_LOG_PATH, { top: "abc" }), /--top/);
  await assert.rejects(() => analyzeFile(DEFAULT_LOG_PATH, { top: -1 }), /--top/);
});

test("поддерживаются CRLF и папка вместо файла вызывает понятную ошибку", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sample-crlf-"));
  try {
    const file = join(dir, "crlf.log");
    await writeFile(file, "2025-01-01T00:00:00Z | INFO | api | I1 | ok\r\n2025-01-01T00:00:01Z | INFO | api | I1 | ok\r\n");
    assert.equal((await analyzeFile(file)).stats.validLines, 2);
    await assert.rejects(() => analyzeFile(dir), /Файл не найден/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("агрегатор: лимит примеров и неверный topN", () => {
  assert.throws(() => createAggregator(-1), /--top/);
  const agg = createAggregator(5, 2);
  for (let i = 0; i < 5; i += 1) {
    agg.addLine();
    agg.addValid({ timestamp: "t", level: "ERROR", source: "s", eventCode: "E", message: "m" }, true);
    agg.addInvalid(i + 1, "bad", "x".repeat(600));
  }
  const r = agg.result();
  assert.equal(r.events.length, 2);
  assert.equal(r.invalidSamples.length, 2);
  assert.equal(r.invalidSamples[0].raw.length, 500);
  assert.equal(r.stats.matchedEvents, 5);
});

test("CLI: запуск без --input из другой папки открывает образец", async () => {
  const { stdout } = await run("node", [CLI], { cwd: tmpdir() });
  assert.match(stdout, /Корректных строк:\s+1200/);
});

test("CLI: фильтры, JSON и CSV через --format/--output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sample-cli-"));
  try {
    const json = join(dir, "r.json");
    const csv = join(dir, "r.csv");
    await run("node", [CLI, "--level", "error", "--top", "3", "--format", "json", "--output", json]);
    const parsed = JSON.parse(await readFile(json, "utf8"));
    assert.equal(parsed.topErrors.length, 3);
    assert.deepEqual(Object.keys(parsed.byLevel), ["ERROR"]);
    await run("node", [CLI, "--format", "csv", "--output", csv]);
    assert.match(await readFile(csv, "utf8"), /"section","key","count","details"/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("CLI: ошибки аргументов дают код 1 и понятное сообщение", async () => {
  await assert.rejects(() => run("node", [CLI, "--input", "missing.log"]), (e) => e.code === 1 && /Файл не найден/.test(e.stderr));
  await assert.rejects(() => run("node", [CLI, "--bogus", "1"]), (e) => /Неизвестный параметр/.test(e.stderr));
  await assert.rejects(() => run("node", [CLI, "--top"]), (e) => /требуется значение/.test(e.stderr));
  const { stdout } = await run("node", [CLI, "--help"]);
  assert.match(stdout, /Использование/);
});
