// Tauri's dev launcher supplies a fresh nonce. No permissive inline/eval policy.
export default defineNitroPlugin((nitroApp) => {
  const nonce = process.env.TAURI_DEV_NONCE
  if (!nonce) return
  nitroApp.hooks.hook('render:html', (html) => {
    for (const section of ['head', 'bodyPrepend', 'body', 'bodyAppend'] as const) {
      html[section] = html[section].map(fragment => fragment.replace(/<(script|style)(?=[\s>])/g, `<$1 nonce="${nonce}"`))
    }
  })
})
