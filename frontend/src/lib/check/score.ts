// The resume score (issue #67): how well a resume follows the checker's
// rules, out of 100. It says nothing about whether a resume gets anyone
// hired. Each category is worth its points (CATEGORIES), shared among its
// rules that apply, a must-fix rule counting twice as much as a suggestion
// (LEVELS). A rule earns its share times its credit: how much of the resume
// passes it, with dismissed suggestions counting as passing (engine.ts).

import type { Report, Rule, RuleResult } from "./engine"
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

// A rule counts once it has looked at the whole resume. One that doesn't
// apply, broke, is still waiting for the PDF or the grammar checker, or has
// only seen part of the text (partial) is left out.
const counts = (result: RuleResult) => (result.status === "passed" || result.status === "failed") && !result.partial

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

/**
 * The categories still being checked, and what each waits on: those with
 * rules on the PDF while the preview is read, and those with grammar rules
 * while the text is checked. It goes by where those checks stand now, as the
 * report can be a moment behind.
 */
export function checkingCategories(
  rules: readonly Rule[],
  { readingPdf, checkingText }: { readingPdf: boolean; checkingText: boolean },
): Map<CategoryId, Rule["reads"]> {
  const checking = new Map<CategoryId, Rule["reads"]>()
  for (const rule of rules) {
    const waits = (rule.reads === "pdf" && readingPdf) || (rule.reads === "grammar" && checkingText)
    // The PDF is what a category with both is said to wait on.
    if (waits && checking.get(rule.category) !== "pdf") checking.set(rule.category, rule.reads)
  }
  return checking
}

/** Each category's points as last checked, kept while it's checked again. */
export type KeptScores = Map<CategoryId, CategoryScore>

/**
 * Keeps the points of each category that isn't being checked, while the
 * resume can be scored. Before it has a name and an entry most rules don't
 * apply, which would look like a category with nothing to score, and once it
 * loses them the points it had are let go, so they aren't shown again when
 * it gets them back before it has been checked anew.
 */
export function keepScores(kept: KeptScores, now: Score, checking: ReadonlyMap<CategoryId, unknown>): void {
  if (now.total === null) {
    kept.clear()
    return
  }
  for (const category of now.categories) if (!checking.has(category.id)) kept.set(category.id, category)
}

/**
 * The score as shown: a category being checked again keeps its points as
 * last checked (`kept`), so its bar and the total don't jump each time the
 * PDF or the text is read again after a change. Until each has been checked
 * once, the total waits ("checking"), and so does a category's bar (null).
 */
export function shownScore(
  now: Score,
  kept: ReadonlyMap<CategoryId, CategoryScore>,
  checking: ReadonlyMap<CategoryId, unknown>,
): { total: number | "checking" | null; categories: (CategoryScore | null)[] } {
  const categories = now.categories.map((category) => (checking.has(category.id) ? (kept.get(category.id) ?? null) : category))
  if (now.total === null) return { total: null, categories }
  const shown = categories.filter((category): category is CategoryScore => category !== null)
  return { total: shown.length === categories.length ? totalOf(shown) : "checking", categories }
}
