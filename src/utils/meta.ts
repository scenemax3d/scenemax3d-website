import { useEffect } from 'react'
import { siteContent } from './content'

export function usePageMeta(title: string, description = siteContent.site.description) {
  useEffect(() => {
    document.title = title

    const descriptionMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )

    if (descriptionMeta) {
      descriptionMeta.content = description
      return
    }

    const meta = document.createElement('meta')
    meta.name = 'description'
    meta.content = description
    document.head.appendChild(meta)
  }, [description, title])
}
