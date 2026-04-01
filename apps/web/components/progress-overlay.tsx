"use client"

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Progress } from "@workspace/ui/components/progress"
import { Button } from "@workspace/ui/components/button"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { RiCheckLine, RiLoader4Line, RiAlertLine } from "@remixicon/react"
import { JobStatus, JOB_STATUS_LABELS } from "@/lib/jobs/types"

interface ProgressOverlayProps {
  open: boolean
  status: JobStatus
  progress: number
  error?: string
  onRetry?: () => void
  onClose?: () => void
}

const STEPS: JobStatus[] = [
  "parsing",
  "clustering",
  "translating",
  "generating",
  "completed",
]

export function ProgressOverlay({
  open,
  status,
  progress,
  error,
  onRetry,
  onClose,
}: ProgressOverlayProps) {
  const isFailed = status === "failed" || !!error
  const isCompleted = status === "completed"
  const currentIndex = STEPS.indexOf(status)

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && (isCompleted || isFailed) && onClose) {
          onClose()
        }
      }}
    >
      <DialogContent
        className="rounded-xl backdrop-blur-sm sm:max-w-md"
        showCloseButton={isCompleted || isFailed}
      >
        <DialogTitle className="sr-only">Translation Progress</DialogTitle>

        <div className="flex flex-col gap-6 py-4">
          <div className="relative pl-2">
            <div className="absolute top-6 bottom-6 left-[19px] w-px bg-border" />

            <div
              className="absolute top-6 left-[19px] w-px bg-primary transition-all duration-500 ease-in-out"
              style={{
                height: `calc(${Math.max(0, (currentIndex / (STEPS.length - 1)) * 100)}% - 24px)`,
              }}
            />

            <div className="flex flex-col gap-6">
              {STEPS.map((step, index) => {
                const isPast = currentIndex > index || isCompleted
                const isCurrent =
                  currentIndex === index && !isFailed && !isCompleted
                const isPending =
                  currentIndex < index && !isFailed && !isCompleted

                return (
                  <div
                    key={step}
                    className="relative z-10 flex animate-in items-center gap-4 fill-mode-both fade-in slide-in-from-bottom-2"
                    style={{ animationDelay: `${index * 80}ms` }}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 bg-background transition-colors duration-300 ${
                        isPast
                          ? "border-primary bg-primary text-primary-foreground"
                          : isCurrent
                            ? "border-primary text-primary"
                            : "border-muted text-muted-foreground"
                      }`}
                    >
                      {isPast ? (
                        <RiCheckLine className="h-4 w-4" />
                      ) : isCurrent ? (
                        <RiLoader4Line className="h-4 w-4 animate-spin" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-muted" />
                      )}
                    </div>

                    <span
                      className={`text-sm font-medium transition-colors duration-300 ${
                        isPast || isCurrent
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {JOB_STATUS_LABELS[step]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {!isFailed && !isCompleted && (
            <div
              className="mt-4 flex animate-in flex-col gap-2 fill-mode-both fade-in"
              style={{ animationDelay: `${STEPS.length * 80}ms` }}
            >
              <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                <span>Overall Progress</span>
                <span className="text-foreground">{progress}%</span>
              </div>
              <Progress
                value={progress}
                className="h-2 bg-muted transition-all duration-300"
              />
            </div>
          )}

          {isFailed && (
            <Alert
              variant="destructive"
              className="mt-2 animate-in rounded-lg border border-destructive/20 bg-destructive/10 p-4 fill-mode-both zoom-in-95 fade-in"
            >
              <RiAlertLine className="h-4 w-4" />
              <AlertDescription className="flex flex-col gap-3">
                <span className="font-medium text-destructive">
                  {error || "An error occurred during translation"}
                </span>
                {onRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                    className="w-fit bg-background hover:bg-destructive/10 hover:text-destructive"
                  >
                    Try Again
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          {isCompleted && (
            <div className="mt-4 flex animate-in flex-col items-center gap-3 rounded-lg border border-primary/20 bg-primary/10 p-4 text-primary fill-mode-both zoom-in-95 fade-in">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
                <RiCheckLine className="h-5 w-5" />
              </div>
              <p className="text-center text-sm font-medium text-foreground">
                Translation completed successfully! Your document is ready.
              </p>
              {onClose && (
                <Button
                  onClick={onClose}
                  className="mt-2 w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  View Document
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
