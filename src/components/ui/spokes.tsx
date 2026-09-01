import { cn } from "@/lib/utils"

/**
 * The loading mark: eight spokes around a hub, turning.
 *
 * From the `@loading-ui` registry (`bunx --bun shadcn@latest add
 * @loading-ui/spokes`), which is recorded under `registries` in
 * `components.json` so the source of this file is findable later. Moved from
 * the `src/components/` root the generator dropped it in to `src/components/ui/`,
 * where every shared control in this app lives.
 *
 * Two changes from the registry's version, both about it being mounted on every
 * navigation in the product rather than once on a demo page:
 *
 *  1. **The `<style>` element is gone.** The original declared its own
 *     `@keyframes` inline, which meant a `<style>` tag entering and leaving the
 *     document on every route change, once per instance. Tailwind's
 *     `animate-spin` is the identical animation — `rotate(360deg)`, linear,
 *     infinite — already in the stylesheet, so the rule is shared and nothing
 *     is injected at runtime.
 *  2. **`--duration` still works.** `animate-spin` sets the `animation`
 *     shorthand at 1s; the inline `animationDuration` below is a longhand in a
 *     style attribute, so it wins over the class and callers can still slow the
 *     mark down with `style={{ '--duration': '2s' }}`.
 *
 * The colour is `currentColor` and stays that way — this component draws a
 * shape, and what green it is drawn in belongs to the screen using it. See
 * `PageLoading`, which sets `text-spinner`.
 */
function Spokes({ className, style, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("animate-spin", className)}
      style={{ animationDuration: "var(--duration, 1s)", ...style }}
      {...props}
    >
      <path
        d="M12 2V6M16.2 7.8L19.1 4.9M18 12H22M16.2 16.2L19.1 19.1M12 18V22M4.9 19.1L7.8 16.2M2 12H6M4.9 4.9L7.8 7.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export { Spokes }
