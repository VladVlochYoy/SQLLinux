// Тесты поиска входного файла: абсолютный путь, текущая папка, корень проекта, ошибки.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveInputPath, DEFAULT_LOG_PATH } from "../src/paths.js";

async function tmp(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

test("абсолютный путь используется как есть", async () => {
  const dir = await tmp("paths-abs-");
  try {
    const file = join(dir, "a.log");
    await writeFile(file, "x");
    assert.equal(await resolveInputPath(file), file);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("относительный путь ищется в текущей папке, затем в корне проекта", async () => {
  const cwd = await tmp("paths-cwd-");
  const root = await tmp("paths-root-");
  try {
    await writeFile(join(root, "only-root.log"), "x");
    await writeFile(join(cwd, "both.log"), "x");
    await writeFile(join(root, "both.log"), "x");
    // Файл только в корне проекта находится при запуске из другой папки.
    assert.equal(await resolveInputPath("only-root.log", { cwd, projectRoot: root }), join(root, "only-root.log"));
    // Если файл есть в обоих местах — приоритет у текущей папки.
    assert.equal(await resolveInputPath("both.log", { cwd, projectRoot: root }), join(cwd, "both.log"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("образец журнала по умолчанию находится из любой текущей папки", async () => {
  const cwd = await tmp("paths-other-");
  try {
    assert.equal(await resolveInputPath("logs_events_sample.log", { cwd }), DEFAULT_LOG_PATH);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("ошибки: пустой путь, отсутствующий файл, папка вместо файла", async () => {
  const dir = await tmp("paths-err-");
  try {
    await assert.rejects(() => resolveInputPath(""), /Не указан путь/);
    await assert.rejects(() => resolveInputPath("nope.log", { cwd: dir, projectRoot: dir }), /Файл не найден/);
    await assert.rejects(() => resolveInputPath(dir), /Файл не найден/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
