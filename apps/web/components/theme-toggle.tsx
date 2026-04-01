"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { RiSunLine, RiMoonLine } from "@remixicon/react"
import { Button } from "@workspace/ui/components/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-full bg-card/50 backdrop-blur-sm"
        disabled
      >
        <div className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="h-9 w-9 cursor-pointer rounded-full bg-card/50 backdrop-blur-sm transition-all hover:bg-muted"
      aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
    >
      {resolvedTheme === "dark" ? (
        <RiSunLine className="h-4 w-4 text-muted-foreground transition-colors hover:text-foreground" />
      ) : (
        <RiMoonLine className="h-4 w-4 text-muted-foreground transition-colors hover:text-foreground" />
      )}
    </Button>
  )
}
