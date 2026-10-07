// The resume score (issue #67): how well a resume follows the checker's
// rules, out of 100. It says nothing about whether a resume gets anyone
// hired. Each category is worth its points (CATEGORIES), shared among its
// rules that apply, a must-fix rule counting twice as much as a suggestion
// (LEVELS). A rule earns its share times its credit: how much of the resume
// passes it, with dismissed suggestions counting as passing (engine.ts).

import type { Report, RuleResult } from "./engine"
import { hasEnoughToCheck } from "./labels"
import { CATEGORIES, LEVELS, type CategoryId } from "./settings"

/** How a category did. */
export interface CategoryScore {
  id: CategoryId
  /** What it's worth. */
  points: number
  /** What the resume earned of them. */
  earned: number
  /** Whether any of its rules apply. When none do, its points go to the others. */
  applies: boolean
}

export interface Score {
  /** From 0 to 100, or null until there's a name and an entry to check. */
  total: number | null
  /** Each category, in CATEGORIES' order. */
  categories: CategoryScore[]
}

// A rule counts once it has run. One that doesn't apply, broke, or is still
// waiting for the PDF or the grammar checker is left out.
const counts = (result: RuleResult) => result.status === "passed" || result.status === "failed"

const weight = (result: RuleResult) => LEVELS[result.rule.level].weight

/**
 * Points as they're shown: whole ones, rounded down, so 100 (or a full
 * category) means everything passed. The small margin keeps a sum that comes
 * to 99.999… from losing a point.
 */
export const wholePoints = (points: number) => Math.floor(points + 1e-9)

/** How a category's rules did, in points. */
export function categoryScore(id: CategoryId, results: readonly RuleResult[]): CategoryScore {
  const { points } = CATEGORIES.find((category) => category.id === id)!
  const ran = results.filter((result) => result.rule.category === id && counts(result))
  const weights = ran.reduce((sum, result) => sum + weight(result), 0)
  const credit = ran.reduce((sum, result) => sum + weight(result) * result.credit, 0)
  return { id, points, earned: weights === 0 ? 0 : (points * credit) / weights, applies: weights > 0 }
}

/**
 * Out of 100: what the categories that apply earned, of what they're worth.
 * Null when none apply.
 */
export function totalOf(categories: readonly CategoryScore[]): number | null {
  const counted = categories.filter((category) => category.applies)
  const possible = counted.reduce((sum, category) => sum + category.points, 0)
  if (possible === 0) return null
  return wholePoints((100 * counted.reduce((sum, category) => sum + category.earned, 0)) / possible)
}

/** The resume's score, from what the checker found (`runChecks`). */
export function scoreOf(report: Report): Score {
  const categories = CATEGORIES.map(({ id }) => categoryScore(id, report.results))
  return { total: hasEnoughToCheck(report.view) ? totalOf(categories) : null, categories }
}
