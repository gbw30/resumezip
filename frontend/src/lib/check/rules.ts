// Every rule the checker runs, in the rubric's order (see issue #58). Each
// group of rules lives in a file of its own and is listed here.

import { CONTACT_RULES } from "./contact"
import type { Rule } from "./engine"
import { SECTION_RULES } from "./sections"

export const RULES: readonly Rule[] = [...CONTACT_RULES, ...SECTION_RULES]
