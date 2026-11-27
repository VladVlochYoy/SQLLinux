// Анализатор: читает журнал построчно (потоком) и передаёт строки
// в парсер, фильтры и агрегатор. Весь файл в памяти не хранится.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { parseLine } from "./parser.js";
import { buildFilters, matchesFilters } from "./filter.js";
import { createAggregator } from "./aggregator.js";
import { resolveInputPath } from "./paths.js";

// Анализирует файл и возвращает готовый отчёт (см. aggregator.result()).
// filePath — путь к журналу; options — from, to, level, source, top.
export async function analyzeFile(filePath, options = {}) {
  const resolvedPath = await resolveInputPath(filePath, options.pathOptions);

  const filters = buildFilters(options);
  const topN = options.top === undefined ? 10 : Number(options.top);
  if (!Number.isInteger(topN) || topN < 0) throw new Error("--top должен быть целым числом >= 0");

  const aggregator = createAggregator(topN, 100);
  let lineNumber = 0;

  const input = createInterface({
    input: createReadStream(resolvedPath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  try {
    for await (const line of input) {
      lineNumber += 1;
      aggregator.addLine();

      const parsed = parseLine(line);
      if (!parsed.ok) {
        aggregator.addInvalid(lineNumber, parsed.error, line);
        continue;
      }
      aggregator.addValid(parsed.record, matchesFilters(parsed.record, filters));
    }
  } catch (error) {
    input.close();
    throw new Error(`Ошибка чтения файла: ${error.message}`);
  }

  return aggregator.result();
}
