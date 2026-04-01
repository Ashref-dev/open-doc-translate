"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { RiArrowLeftRightLine } from "@remixicon/react"
import { config } from "@/lib/config"

interface LanguageSelectorProps {
  sourceLang: string
  targetLang: string
  onSourceChange: (lang: string) => void
  onTargetChange: (lang: string) => void
  onSwap: () => void
}

export function LanguageSelector({
  sourceLang,
  targetLang,
  onSourceChange,
  onTargetChange,
  onSwap,
}: LanguageSelectorProps) {
  return (
    <div className="flex w-full flex-col items-center gap-4 rounded-xl border border-white/[0.06] bg-card/30 p-4 backdrop-blur-sm sm:flex-row">
      <div className="w-full space-y-1.5 sm:flex-1">
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
          From
        </div>
        <Select
          value={sourceLang}
          onValueChange={(v) => v && onSourceChange(v)}
        >
          <SelectTrigger className="h-12 w-full rounded-lg border-white/10 bg-card/50 backdrop-blur-sm">
            <SelectValue placeholder="Select source language" />
          </SelectTrigger>
          <SelectContent>
            {config.supportedLanguages.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                <span className="text-base leading-none">{lang.flag}</span>
                <span className="truncate">{lang.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onSwap}
        className="group mt-0 h-10 w-10 shrink-0 rounded-full transition-transform duration-300 hover:bg-primary/10 hover:text-primary active:scale-[0.95] sm:mt-7"
        aria-label="Swap languages"
      >
        <RiArrowLeftRightLine className="h-5 w-5 rotate-90 transition-transform duration-300 group-hover:rotate-180 sm:rotate-0" />
      </Button>

      <div className="w-full space-y-1.5 sm:flex-1">
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
          To
        </div>
        <Select
          value={targetLang}
          onValueChange={(v) => v && onTargetChange(v)}
        >
          <SelectTrigger className="h-12 w-full rounded-lg border-white/10 bg-card/50 backdrop-blur-sm">
            <SelectValue placeholder="Select target language" />
          </SelectTrigger>
          <SelectContent>
            {config.supportedLanguages.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                <span className="text-base leading-none">{lang.flag}</span>
                <span className="truncate">{lang.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
