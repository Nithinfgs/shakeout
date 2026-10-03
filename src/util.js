/** Message of anything that was thrown. @param {unknown} err */
export const messageOf = (err) => (err instanceof Error ? err.message : String(err));
