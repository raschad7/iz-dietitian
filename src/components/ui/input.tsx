"use client"

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { useLocale } from "next-intl"

import { Icon, type IconName } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

const ARABIC_SCRIPT = /\p{Script=Arabic}/u

/**
 * The box, the shape, the focus treatment and every state live in `.q-field`
 * (globals.css) — shared with Textarea, Select and SelectField so the four
 * cannot drift and a change to the shape language is one edit. Only what is
 * specific to a text input belongs here.
 */
type InputProps = React.ComponentProps<"input"> & {
  /**
   * A leading glyph inside the box, at the field's inline-start. The auth
   * screens put one on every field; three of them were hand-rolling the same
   * `relative` wrapper and absolute span, which is how a design system drifts.
   *
   * It is decorative — the `Label` above carries the name of the field, and an
   * icon announced beside it would say everything twice.
   */
  icon?: IconName
  /**
   * Paints controlled or uncontrolled text in an ordinary text layer while
   * retaining the native input for focus, selection, keyboard input and
   * accessibility.
   *
   * Almarai contains Arabic glyph ink below the descent declared in its font
   * metrics. Chromium clips that ink inside native inputs, which can remove
   * the lower dots from letters such as ي. The repair is automatic for Arabic
   * text/search fields and for localized credential placeholders. Set this to
   * false only when a composite control supplies its own ordinary text layer.
   * Mirror non-default field typography or padding through
   * `unclippedTextClassName`.
   */
  unclippedText?: boolean
  unclippedTextClassName?: string
  unclippedTextDirection?: React.HTMLAttributes<HTMLSpanElement>["dir"]
  inputShellClassName?: string
}

function Input({
  className,
  type,
  icon,
  unclippedText = true,
  unclippedTextClassName,
  unclippedTextDirection = "auto",
  inputShellClassName,
  style,
  value,
  defaultValue,
  placeholder,
  onChange,
  ref,
  lang,
  ...props
}: InputProps) {
  const locale = useLocale()
  const normalizedType = type?.toLowerCase() ?? "text"
  const mirrorsValue = unclippedText && (normalizedType === "text" || normalizedType === "search")
  const mirrorsPlaceholder =
    unclippedText &&
    !mirrorsValue &&
    Boolean(placeholder) &&
    ["email", "password", "tel", "url"].includes(normalizedType)
  const overlayMode = mirrorsValue ? "value" : mirrorsPlaceholder ? "placeholder" : undefined
  const usesArabicTextLayer = overlayMode !== undefined && (lang ?? locale).startsWith("ar")
  const controlled = value !== undefined
  const [uncontrolledText, setUncontrolledText] = React.useState(() =>
    defaultValue === undefined || defaultValue === null || defaultValue === ""
      ? ""
      : mirrorsValue
        ? String(defaultValue)
        : "present"
  )
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  const setInputRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node

      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )

  React.useEffect(() => {
    const input = inputRef.current
    const form = input?.form

    if (!form || controlled || !overlayMode) return

    let resetTimer: ReturnType<typeof setTimeout> | undefined
    const handleReset = () => {
      resetTimer = setTimeout(
        () => setUncontrolledText(mirrorsValue ? input.value : input.value === "" ? "" : "present"),
        0
      )
    }

    form.addEventListener("reset", handleReset)

    return () => {
      form.removeEventListener("reset", handleReset)
      if (resetTimer) clearTimeout(resetTimer)
    }
  }, [controlled, mirrorsValue, overlayMode])

  const currentText = mirrorsValue ? (controlled ? String(value ?? "") : uncontrolledText) : ""
  const hasContent = controlled ? value !== null && value !== "" : uncontrolledText !== ""
  const visibleText =
    overlayMode === "placeholder"
      ? placeholder
      : !hasContent
        ? placeholder
        : currentText
  const showsPlaceholder = overlayMode === "placeholder" || !hasContent
  /*
   * Keep Latin text native even on an Arabic page. The browser's bidi input
   * algorithm keeps that text and its caret together; hiding only the native
   * text would leave the mirrored LTR value at the left while the real RTL
   * caret stayed at the right. Only Arabic glyphs need the Almarai repair.
   */
  const showsTextLayer =
    usesArabicTextLayer &&
    (overlayMode === "value" || !hasContent) &&
    typeof visibleText === "string" &&
    ARABIC_SCRIPT.test(visibleText)
  const field = (
    <InputPrimitive
      ref={setInputRef}
      type={type}
      data-slot="input"
      data-unclipped-input={overlayMode}
      className={cn(
        // 48px and 20px of padding, matching the default button: a field and
        // the button that submits it sit in the same row and must be the same
        // height, and the touch-target floor applies to both.
        "q-field h-12 px-5 py-1",
        /*
          One step under the value it stands in for, and under the `Label`
          above it. The placeholder is an example, not the answer and not the
          name of the field: at the same 16px as both it competed with them,
          and an empty form read as a column of filled-in boxes.
        */
        "placeholder:text-body-sm placeholder:text-placeholder",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-caption file:font-medium file:text-foreground",
        // The well below is 48px, so the text starts where a field with no icon
        // would have its 20px of padding, plus the glyph and a gap.
        icon && "ps-12",
        showsTextLayer && "placeholder:text-transparent",
        className
      )}
      style={{
        ...style,
        ...(showsTextLayer
          ? {
              color: "transparent",
              WebkitTextFillColor: "transparent",
              caretColor: style?.caretColor ?? "var(--foreground)",
            }
          : null),
        /*
         * The red edge of an invalid field, stated here rather than left to
         * `.q-field[aria-invalid='true']` in globals.css. That rule's
         * `outline-color` and halo do land, but its `border-color` was being
         * beaten by something later in the cascade, so an invalid field wore a
         * red glow around an olive box. An inline value is the one place
         * nothing can outrank.
         */
        ...(props["aria-invalid"] ? { borderColor: "var(--destructive)" } : null),
      }}
      value={value}
      defaultValue={defaultValue}
      placeholder={placeholder}
      lang={lang}
      onChange={(event) => {
        if (!controlled && overlayMode) {
          setUncontrolledText(
            mirrorsValue ? event.target.value : event.target.value === "" ? "" : "present"
          )
        }
        onChange?.(event)
      }}
      {...props}
    />
  )

  if (!icon && !usesArabicTextLayer) return field

  /*
    ⚠ **With an `icon` or `unclippedText`, the field is no longer the outer
    element — and `className` still goes to the inner `<input>`.**

    That is right for anything describing the *field*: padding, text, state
    overrides. It is wrong for anything describing its *box* in a parent's
    layout. `.q-field` pins the input to `width: 100%`, so the input measures
    100% of this span while the span measures itself from the input — and in a
    flex or grid parent, where `width: auto` means shrink-to-fit rather than
    fill, that resolves to the input's intrinsic ~20 characters. A `w-full`,
    `flex-1` or `min-w-*` passed here lands on the wrong box and silently does
    nothing.

    The shared shell fills ordinary form rows. Composite controls that need it
    to participate as a flex or grid item pass `inputShellClassName`; classes
    describing the actual control still belong in `className`.
  */
  return (
    <span
      className={cn("relative block w-full min-w-0", inputShellClassName)}
      data-unclipped-shell={overlayMode}
      lang={lang}
    >
      {icon ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 start-0 flex w-12 items-center justify-center text-muted-foreground"
        >
          <Icon name={icon} className="size-5" />
        </span>
      ) : null}
      {field}
      {showsTextLayer ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 start-0 end-0 flex min-w-0 items-center overflow-visible whitespace-nowrap",
            icon ? "ps-12 pe-5" : "px-5",
            showsPlaceholder ? "text-body-sm text-placeholder" : "text-body-md text-foreground",
            unclippedTextClassName,
          )}
        >
          <span
            dir={unclippedTextDirection}
            className="min-w-0 flex-1 truncate text-start"
          >
            {visibleText}
          </span>
        </span>
      ) : null}
    </span>
  )
}

export { Input }
