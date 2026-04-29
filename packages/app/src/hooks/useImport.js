import { useRef } from 'react'
import { importLinks } from '../api/linksApi'

export function useImport({ project, showSnackbar, reload }) {
  const importInputRef = useRef(null)

  const triggerImport = () => importInputRef.current?.click()

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const payload = Array.isArray(data) ? { links: data } : data
      if (project?.id && project.id !== 'unassigned') {
        payload.links = payload.links.map(l => ({ ...l, projects: [project.id] }))
      }
      const { added, tagged, skipped } = await importLinks(payload)
      const parts = []
      if (added)  parts.push(`${added} added`)
      if (tagged) parts.push(`${tagged} tagged with project`)
      if (skipped && !added && !tagged) parts.push(`${skipped} already up to date`)
      showSnackbar({ message: `Import complete — ${parts.join(', ') || 'nothing changed'}` })
      reload()
    } catch {
      showSnackbar({ message: 'Import failed — invalid file' })
    }
  }

  return { importInputRef, triggerImport, handleFileChange }
}
