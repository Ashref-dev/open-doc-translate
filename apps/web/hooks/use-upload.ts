import { useState } from "react"

export type UploadState =
  | "idle"
  | "dragover"
  | "uploading"
  | "uploaded"
  | "error"

export interface FileInfo {
  name: string
  size: number
  pageCount?: number
}

export function useUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>("idle")
  const [fileInfo, setFileInfo] = useState<FileInfo | undefined>()
  const [uploadId, setUploadId] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()

  const upload = async (selectedFile: File) => {
    setFile(selectedFile)
    setUploadState("uploading")
    setError(undefined)

    const formData = new FormData()
    formData.append("file", selectedFile)

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Upload failed")
      }

      const data = await response.json()

      setUploadId(data.uploadId)
      setFileInfo({
        name: data.fileName || selectedFile.name,
        size: data.fileSize || selectedFile.size,
        pageCount: data.pageCount,
      })
      setUploadState("uploaded")
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred")
      setUploadState("error")
    }
  }

  const reset = () => {
    setFile(null)
    setUploadState("idle")
    setFileInfo(undefined)
    setUploadId(undefined)
    setError(undefined)
  }

  return { upload, uploadState, fileInfo, uploadId, error, reset }
}
