// Every rule the checker runs, in the rubric's order (see issue #58). Each
// group of rules lives in a file of its own and is listed here.

import { BULLET_RULES } from "./bullets"
import { CONTACT_RULES } from "./contact"
import { DATE_RULES } from "./dates"
import { POLISH_RULES } from "./polish"
import { READABLE_RULES } from "./readable"
import type { Rule } from "./engine"
import { SECTION_RULES } from "./sections"

export const RULES: readonly Rule[] = [...CONTACT_RULES, ...READABLE_RULES, ...SECTION_RULES, ...DATE_RULES, ...BULLET_RULES, ...POLISH_RULES]
