import { getDraft, saveDraft } from '@/lib/composer-drafts'
import { getLiveComposerDraft } from '@/hooks/useComposerDraft'

/** Wrap a workspace-relative path so the agent can spot it in the prompt. */
export function formatFileReference(relativePath: string): string {
    return `\`${relativePath}\``
}

/**
 * Append a file reference to a session's composer draft.
 *
 * Use the mounted composer's latest text when the files are displayed beside
 * it. Full-page navigation restores the saved draft when the composer mounts.
 */
export function appendFileReferenceToComposerDraft(sessionId: string, relativePath: string): void {
    const reference = formatFileReference(relativePath)
    const composer = getLiveComposerDraft(sessionId)
    const existing = (composer?.getText() ?? getDraft(sessionId)).replace(/[ \t\r\n]+$/, '')
    const text = existing.length > 0 ? `${existing}\n${reference}` : reference
    saveDraft(sessionId, text)
    composer?.setText(text)
}
