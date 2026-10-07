import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import { syncNow, useSync } from './useSync'

dayjs.extend(relativeTime)
dayjs.extend(localizedFormat)

/** The view observes the native worker; navigation never owns its lifetime. */
export const useInternalFileUpload = () => {
  const status = useSync()
  const clock = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => { timer = setInterval(() => { clock.value = Date.now() }, 10_000) })
  onUnmounted(() => { clearInterval(timer) })
  const lastUpdated = computed(() => status.value.lastSuccess ? dayjs.unix(status.value.lastSuccess) : null)
  return {
    handleUpload: async () => {
      try { await syncNow() } catch (error) { status.value.error = String(error) }
    },
    lastUpdated,
    lastUpdatedFromNow: computed(() => { void clock.value; return lastUpdated.value?.fromNow() ?? '' }),
    formattedLastUpdated: computed(() => lastUpdated.value?.format('lll') ?? ''),
    /** Relative time for a unix timestamp; re-evaluates with the shared clock. */
    fromNow: (unix: number) => { void clock.value; return dayjs.unix(unix).fromNow() },
    formatted: (unix: number) => dayjs.unix(unix).format('lll'),
    isProcessing: computed(() => status.value.isProcessing),
    watchingFiles: computed(() => status.value.files),
    syncError: computed(() => status.value.error),
  }
}
