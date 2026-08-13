import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

/**
 * The loading glyph, reached through `Icon` so it is the same `refresh` mark
 * the rest of the app spins.
 *
 * `name` is omitted from the props: an `<svg>` has a `name` attribute of its
 * own, so a caller spreading svg props could hand this component a string where
 * `Icon` expects one of its registry's keys. The spinner is one glyph by
 * definition, so the prop has nothing to say here.
 *
 * `aria-hidden={undefined}` is deliberate. `Icon` hides itself from assistive
 * technology unless it is given a label, which is right for a glyph sitting
 * beside text and wrong for this one — a spinner *is* the message, so it keeps
 * the `role` and the name the registry gave it.
 */
function Spinner({
  className,
  ...props
}: Omit<React.ComponentProps<"svg">, "name" | "children" | "dangerouslySetInnerHTML">) {
  return (
    <Icon
      name="refresh"
      data-slot="spinner"
      role="status"
      aria-hidden={undefined}
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
