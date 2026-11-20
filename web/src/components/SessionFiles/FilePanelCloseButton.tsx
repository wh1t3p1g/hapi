import { createContext } from 'react'
import { CloseIcon } from '@/components/icons'
import { useTranslation } from '@/lib/use-translation'

export const FilePanelCloseContext = createContext<(() => void) | null>(null)

export function FilePanelCloseButton({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation()
    return (
        <button
            type="button"
            onClick={onClose}
            aria-label={t('button.close')}
            title={t('button.close')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
        >
            <CloseIcon className="h-4 w-4" />
        </button>
    )
}
