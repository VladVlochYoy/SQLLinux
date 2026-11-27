// Модуль поиска входного файла журнала.
// Решает проблему запуска из любой папки: относительный путь ищется
// не только в текущей папке (cwd), но и в корне проекта.

import { stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Корень проекта: этот файл лежит в <корень>/src/, поэтому поднимаемся на уровень выше.
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Журнал по умолчанию — приложенный образец на 1200 корректных записей.
export const DEFAULT_LOG_NAME = "logs_events_sample.log";
export const DEFAULT_LOG_PATH = join(PROJECT_ROOT, DEFAULT_LOG_NAME);

// Проверяет, что по пути лежит именно обычный файл (а не папка и не «пустота»).
async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// Возвращает полный путь к существующему файлу журнала.
// Порядок поиска:
//   1) абсолютный путь — используется как есть;
//   2) относительный путь — сначала от текущей папки, затем от корня проекта.
// Если файл нигде не найден, выбрасывается ошибка со списком проверенных мест.
// Параметры cwd и projectRoot вынесены для удобства тестирования.
export async function resolveInputPath(inputPath, { cwd = process.cwd(), projectRoot = PROJECT_ROOT } = {}) {
  if (!inputPath) throw new Error("Не указан путь к файлу (--input)");

  const candidates = isAbsolute(inputPath)
    ? [inputPath]
    : [...new Set([resolve(cwd, inputPath), resolve(projectRoot, inputPath)])];

  for (const candidate of candidates) {
    if (await isFile(candidate)) return candidate;
  }
  throw new Error(`Файл не найден или недоступен: ${inputPath} (проверено: ${candidates.join("; ")})`);
}
