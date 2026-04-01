"use client"

import { useState } from "react"
import { Badge } from "@workspace/ui/components/badge"
import { RiAlertLine, RiArrowDownSLine } from "@remixicon/react"

interface TranslationWarningsProps {
  warnings?: string[]
}

export function TranslationWarnings({
  warnings = [],
}: TranslationWarningsProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (!warnings || warnings.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-warning/20 bg-warning/5 p-3 backdrop-blur-sm dark:border-warning/15 dark:bg-warning/10">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full cursor-pointer items-center justify-between text-left focus:outline-none"
      >
        <div className="flex items-center gap-2 text-warning-foreground">
          <RiAlertLine className="h-4 w-4" />
          <span className="text-sm font-medium">
            {warnings.length} layout{" "}
            {warnings.length === 1 ? "adjustment" : "adjustments"}
          </span>
        </div>
        <RiArrowDownSLine
          className={`h-4 w-4 text-warning-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-1.5 pt-2">
            {warnings.map((warning) => (
              <Badge
                key={warning}
                variant="secondary"
                className="w-fit max-w-full justify-start bg-warning/10 text-left font-normal text-warning-foreground hover:bg-warning/15"
              >
                <span className="line-clamp-2 text-xs">{warning}</span>
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
