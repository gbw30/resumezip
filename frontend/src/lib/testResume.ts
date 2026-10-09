// For tests that saved data in a shape the editor's types don't describe, as
// older or broken versions could have saved it, is read without breaking.

import type { Resume } from "./resume"

/** `data` as a saved resume, though it isn't one the editor would save. */
export const asSaved = (data: unknown) => data as Resume
