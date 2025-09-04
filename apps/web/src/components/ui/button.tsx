import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-white text-black rounded-xl font-medium hover:bg-gray-200 shadow-lg hover:shadow-xl dark:bg-black dark:text-white dark:hover:bg-gray-800",
        destructive:
          "bg-destructive text-white shadow-lg hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 rounded-xl font-medium hover:shadow-xl",
        outline:
          "bg-black/50 backdrop-blur-sm text-white border border-white/20 rounded-xl font-medium hover:bg-black/70 shadow-lg hover:shadow-xl dark:bg-white/10 dark:border-white/20 dark:text-white dark:hover:bg-white/20",
        secondary:
          "bg-secondary text-secondary-foreground shadow-lg hover:bg-secondary/80 rounded-xl font-medium hover:shadow-xl",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 rounded-xl",
        link: "text-primary underline-offset-4 hover:underline rounded-xl",
      },
      size: {
        default: "px-8 py-4 has-[>svg]:px-6",
        sm: "px-6 py-3 gap-1.5 has-[>svg]:px-4 text-sm",
        lg: "px-8 py-4 has-[>svg]:px-6 text-lg",
        icon: "size-12 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
