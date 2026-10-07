/** Account folder name from `.../WTF/Account/<account>/SavedVariables/...`; falls back to the file name. */
export function accountName(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  const index = parts.findIndex((part, i) => part.toLowerCase() === 'account' && parts[i - 1]?.toLowerCase() === 'wtf')
  return (index >= 0 ? parts[index + 1] : undefined) ?? parts.at(-1) ?? path
}

/** The selected folder's last segment, e.g. `_retail_` or `_classic_`. */
export function folderFlavor(path: string): string {
  return path.split(/[\\/]+/).filter(Boolean).at(-1) ?? ''
}
