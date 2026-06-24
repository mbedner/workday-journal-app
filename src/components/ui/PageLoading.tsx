import { Sk } from './Skeleton'

/** Generic Suspense fallback for lazy-loaded routes — shown briefly while a route's JS chunk loads. */
export function PageLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <Sk className="h-2.5 w-24" />
        <Sk className="h-8 w-56" />
      </div>
      <Sk className="h-32 w-full" />
    </div>
  )
}
