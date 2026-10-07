// Browsers can delete what a site saved without asking: Chrome and Firefox
// when the disk is nearly full, starting with the sites used least recently,
// and Safari after seven days of use without a visit. A site can ask to have
// its data kept ("persistent storage"). Chrome and Safari decide by
// themselves, from how much the site is used, whether it's bookmarked or on
// the Home Screen; Firefox asks the person. So resumezip only asks once
// there's a resume worth keeping, and not again for a while after a no.

/** Where the time of the last request is saved. */
export const ASKED_KEY = "storage-persist-asked"

/** How long to wait before asking again after a no, in milliseconds. */
export const ASK_AGAIN_AFTER = 7 * 24 * 60 * 60 * 1000

type Manager = Pick<StorageManager, "persist" | "persisted">
type Permissions = Pick<globalThis.Permissions, "query">

/**
 * Asks the browser to keep what's saved in `storage` (localStorage) instead
 * of deleting it to make room, unless it already does, the person has said
 * no, or it said no in the last week. Resolves to whether it keeps it now.
 * Never rejects, and doesn't ask when it can't note that it asked (as when
 * storage is full), so Firefox can't ask the person on every page.
 */
export async function keepSavedData(
  storage: Storage,
  manager: Manager | undefined = globalThis.navigator?.storage,
  permissions: Permissions | undefined = globalThis.navigator?.permissions,
  now = Date.now(),
): Promise<boolean> {
  try {
    // Older browsers and some apps' built-in browsers don't have it.
    if (!manager?.persist || !manager.persisted) return false
    if (await manager.persisted()) return true
    if ((await permissionState(permissions)) === "denied") return false
    const asked = Number(storage.getItem(ASKED_KEY))
    if (asked && now >= asked && now - asked < ASK_AGAIN_AFTER) return false
    // Throws, so nothing is asked, when this can't be saved.
    storage.setItem(ASKED_KEY, String(now))
    return await manager.persist()
  } catch {
    // Storage can't be read or written any more; resumes still save as before.
    return false
  }
}

/** Whether the person has let the site keep its data, or null if the browser won't say. */
async function permissionState(permissions: Permissions | undefined) {
  try {
    // Safari doesn't know this permission's name and rejects.
    return (await permissions?.query({ name: "persistent-storage" }))?.state ?? null
  } catch {
    return null
  }
}
