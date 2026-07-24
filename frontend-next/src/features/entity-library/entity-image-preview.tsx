import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ImageIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { tryParseEntityFileReference } from '@/shared/entity-file-reference'
import { downloadEntityFile, getEntityFile } from './api'

type PreviewVariant = 'panel' | 'thumbnail'
const MAX_THUMBNAIL_PREVIEW_BYTES = 5 * 1024 * 1024

function BlobImage({
  blob,
  alt,
  className,
}: {
  blob: Blob
  alt: string
  className: string
}) {
  const [source, setSource] = useState<string | null>(null)

  useEffect(() => {
    const nextSource = URL.createObjectURL(blob)
    setSource(nextSource)
    return () => URL.revokeObjectURL(nextSource)
  }, [blob])

  return source ? (
    <img
      src={source}
      alt={alt}
      className={className}
      decoding="async"
      loading="lazy"
    />
  ) : null
}

export function EntityImagePreview({
  value,
  token,
  alt,
  variant = 'panel',
}: {
  value: unknown
  token: string
  alt?: string
  variant?: PreviewVariant
}) {
  const reference = tryParseEntityFileReference(value)
  const fileQuery = useQuery({
    queryKey: ['entity-file', reference?.file_asset_id, token],
    queryFn: () => getEntityFile(token, reference!.file_asset_id),
    enabled: Boolean(token && reference?.file_asset_id),
  })
  const file = fileQuery.data
  const isImage =
    file?.content_type?.toLowerCase().startsWith('image/') ?? false
  // ponytail: list previews use the original file up to 5 MiB; add a server thumbnail
  // endpoint if the setup library grows beyond a small lab catalogue.
  const previewAllowed =
    isImage &&
    (variant !== 'thumbnail' ||
      (file?.size_bytes != null &&
        file.size_bytes <= MAX_THUMBNAIL_PREVIEW_BYTES))
  const previewQuery = useQuery({
    queryKey: [
      'entity-file-preview',
      reference?.file_asset_id,
      reference?.sha256,
      token,
    ],
    queryFn: async ({ signal }) =>
      (await downloadEntityFile(token, reference!.file_asset_id, signal)).blob,
    enabled: Boolean(token && reference?.file_asset_id && previewAllowed),
    staleTime: Infinity,
    gcTime: 0,
  })
  const blob =
    previewQuery.data?.type.toLowerCase().startsWith('image/') === true
      ? previewQuery.data
      : null
  const imageAlt = alt ?? file?.original_name ?? reference?.original_name ?? ''

  if (variant === 'thumbnail') {
    return (
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
        {blob ? (
          <BlobImage
            blob={blob}
            alt={imageAlt}
            className="size-full object-contain p-1"
          />
        ) : (
          <ImageIcon
            aria-hidden="true"
            className={cn(
              'size-5 text-muted-foreground',
              previewQuery.isError && 'text-destructive',
            )}
          />
        )}
      </div>
    )
  }

  if (!blob) return null

  return (
    <div className="mb-3 flex max-h-72 min-h-32 items-center justify-center overflow-hidden rounded-lg border bg-muted/20">
      <BlobImage
        blob={blob}
        alt={imageAlt}
        className="max-h-72 w-full object-contain p-2"
      />
    </div>
  )
}
