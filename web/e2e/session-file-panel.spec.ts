import { expect, test } from '@playwright/test'
import { installHapiAuth } from './helpers/hapi-live'

const sessionId = 'file-panel-session'
const sessionPath = `/sessions/${sessionId}`
const fileText = 'Notes from the workspace'
const draftText = 'Draft kept while reading the file'

test.use({ serviceWorkers: 'block' })

function createSession(now: number, active = true) {
    return {
        id: sessionId,
        namespace: 'test',
        seq: 1,
        createdAt: now,
        updatedAt: now,
        active,
        activeAt: now,
        thinking: false,
        thinkingAt: now,
        metadata: { path: '/workspace/project', host: 'test', flavor: 'codex' },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
    }
}

test.beforeEach(async ({ page, baseURL }) => {
    await installHapiAuth(page, new URL(baseURL!).origin, 'file-panel-test-token')
    const now = Date.now()
    const session = createSession(now)
    const reply = {
        id: 'reply',
        localId: null,
        seq: 1,
        createdAt: now,
        invokedAt: now,
        content: { role: 'agent', content: { type: 'codex', data: { type: 'message', message: '[Open notes](./notes.txt)' } } },
    }
    const messagePage = {
        epoch: 1,
        nextBeforeSeq: null,
        nextBeforeAt: null,
        snapshotHeadSeq: 1,
        snapshotHeadAt: now,
        hasMore: false,
    }
    await page.route(new URL('/health', baseURL!).href, route => route.fulfill({ json: { status: 'ok' } }))
    await page.route(new URL('/api/**', baseURL!).href, async route => {
        const { pathname } = new URL(route.request().url())
        switch (pathname) {
            case '/api/auth':
                return route.fulfill({ json: { token: 'file-panel-test-jwt', user: { id: 1 } } })
            case '/api/events':
                return route.fulfill({ contentType: 'text/event-stream', body: ': ready\n\n' })
            case '/api/sessions':
                return route.fulfill({ json: { sessions: [session] } })
            case '/api/machines':
                return route.fulfill({ json: { machines: [] } })
            case '/api/sessions/scratchlist-status':
                return route.fulfill({ json: { sessionIds: [] } })
            case `/api${sessionPath}`:
                return route.fulfill({ json: { session } })
            case `/api${sessionPath}/messages`:
                return route.fulfill({ json: {
                    messages: [reply],
                    page: {
                        ...messagePage,
                        direction: 'latest',
                        limit: 200,
                        reset: false,
                        nextAfterSeq: null,
                        nextAfterAt: null,
                    },
                } })
            case `/api${sessionPath}/messages/reply/context`:
                return route.fulfill({ json: { messages: [reply], targetMessageId: 'reply', page: messagePage } })
            case `/api${sessionPath}/git-status`:
                return route.fulfill({ json: { success: true, stdout: '# branch.head main\n? notes.txt\n' } })
            case `/api${sessionPath}/git-diff-file`:
            case `/api${sessionPath}/git-diff-numstat`:
                return route.fulfill({ json: { success: true, stdout: '' } })
            case `/api${sessionPath}/file`:
                return route.fulfill({ json: { success: true, content: Buffer.from(fileText).toString('base64') } })
            default:
                return route.fulfill({ status: 404, json: { error: 'Unavailable in this test' } })
        }
    })
})

test('opens file links and the file browser beside the same editable composer', async ({ page }) => {
    await page.goto(sessionPath)
    const composer = page.getByTestId('composer-shell').getByRole('textbox')
    await composer.fill(draftText)
    const composerElement = await composer.elementHandle()
    await page.getByRole('link', { name: 'Open notes' }).click()

    const panel = page.getByRole('complementary', { name: 'Files' })
    await expect(panel.getByText(fileText)).toBeVisible()
    const panelBox = await panel.boundingBox()
    const composerBox = await composer.boundingBox()
    expect(panelBox!.x).toBeGreaterThanOrEqual(composerBox!.x + composerBox!.width - 1)
    expect(await composer.evaluate((element, previous) => element === previous, composerElement)).toBe(true)
    await composer.fill(`${draftText} and edited`)

    await page.goBack()
    await expect(panel).toBeHidden()
    await expect(composer).toContainText(`${draftText} and edited`)

    await page.getByRole('button', { name: 'Files', exact: true }).click()
    await expect(panel.getByText('notes.txt')).toBeVisible()
    await panel.getByText('notes.txt').click()
    await expect(panel.getByText(fileText)).toBeVisible()
    await panel.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(panel.getByText('notes.txt')).toBeVisible()
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(panel).toBeHidden()
    await expect(composer).toContainText(`${draftText} and edited`)
})

test('lays out a direct file link according to the space left by the session list', async ({ page }) => {
    const search = new URLSearchParams({
        path: Buffer.from('notes.txt').toString('base64'),
        origin: 'chat',
    })
    await page.goto(`${sessionPath}/file?${search}`)
    const panel = page.getByRole('complementary', { name: 'Files' })
    const composer = page.getByTestId('composer-shell').getByRole('textbox')
    await expect(panel.getByText(fileText)).toBeVisible()
    await expect(composer).toBeVisible()

    await page.setViewportSize({ width: 1120, height: 900 })
    await expect(panel).toBeHidden()
    await expect(page.getByText(fileText)).toBeVisible()
    await expect(composer).toBeHidden()

    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(panel.getByText(fileText)).toBeVisible()
    await expect(composer).toBeVisible()
})

test('keeps receiving live replies while browsing files beside the conversation', async ({ page }) => {
    const releaseReply = Promise.withResolvers<void>()
    const liveReply = 'Live reply while the file preview is open'
    const isSessionStream = (url: URL) =>
        url.pathname === '/api/events' && url.searchParams.get('sessionId') === sessionId
    await page.route(isSessionStream, async route => {
        await releaseReply.promise
        const now = Date.now()
        const event = {
            type: 'message-received',
            sessionId,
            message: {
                id: 'live-reply',
                localId: null,
                seq: 2,
                createdAt: now,
                invokedAt: now,
                content: { role: 'agent', content: { type: 'codex', data: { type: 'message', message: liveReply } } },
            },
        }
        await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(event)}\n\n` })
    })
    const streamRequest = page.waitForRequest(request => isSessionStream(new URL(request.url())))
    try {
        await page.goto(sessionPath)
        await streamRequest
        await page.getByRole('button', { name: 'Files', exact: true }).click()
        const panel = page.getByRole('complementary', { name: 'Files' })
        await panel.getByText('notes.txt').click()
        await expect(panel.getByText(fileText)).toBeVisible()
        releaseReply.resolve()
        await expect(page.getByText(liveReply, { exact: true })).toBeVisible()
    } finally {
        releaseReply.resolve()
    }
})

test('keeps full-page file navigation when the conversation has limited space', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(sessionPath)
    const composer = page.getByTestId('composer-shell').getByRole('textbox')
    await composer.fill(draftText)
    await page.getByRole('link', { name: 'Open notes' }).click()
    await expect(page.getByText(fileText)).toBeVisible()
    await expect(composer).toBeHidden()
    await page.goBack()
    await expect(composer).toBeVisible()
    await expect(composer).toContainText(draftText)
})

test('restores a rejected send after a wide file preview becomes full page', async ({ page }) => {
    const releaseResponse = Promise.withResolvers<void>()
    await page.route(`**/api${sessionPath}/messages`, async route => {
        if (route.request().method() !== 'POST') return route.fallback()
        await releaseResponse.promise
        await route.fulfill({ status: 500, json: { error: 'Test rejection' } })
    })
    await page.goto(sessionPath)
    await page.getByRole('link', { name: 'Open notes' }).click()
    const composer = page.getByTestId('composer-shell').getByRole('textbox')
    await composer.fill(draftText)
    const posted = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === `/api${sessionPath}/messages`)
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await posted

    await page.setViewportSize({ width: 1120, height: 900 })
    await expect(composer).toBeHidden()
    const rejected = page.waitForResponse(response => response.status() === 500 && response.request().method() === 'POST' && new URL(response.url()).pathname === `/api${sessionPath}/messages`)
    releaseResponse.resolve()
    await rejected

    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(composer).toHaveText(draftText)
    await expect(page.getByTestId('composer-send-error')).toBeVisible()
})

test('adds the file reference after the current draft in the mounted composer', async ({ page }) => {
    await page.goto(sessionPath)
    const composer = page.getByTestId('composer-shell').getByRole('textbox')
    await composer.fill(draftText)
    await page.getByRole('button', { name: 'Files', exact: true }).click()
    const panel = page.getByRole('complementary', { name: 'Files' })
    await panel.getByText('notes.txt', { exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Add to composer' }).click()

    await expect(panel).toBeHidden()
    await expect.poll(() => composer.innerText()).toBe(`${draftText}\n\`notes.txt\``)
})

test('consumes and dismisses chat search without leaving the file preview', async ({ page }) => {
    const search = new URLSearchParams({
        path: Buffer.from('notes.txt').toString('base64'),
        origin: 'chat',
        messageId: 'reply',
        messageQuery: 'Open',
    })
    await page.goto(`${sessionPath}/file?${search}`)
    const closeSearch = page.getByRole('button', { name: 'Close content search' })
    await expect(closeSearch).toBeVisible()
    await expect(page).not.toHaveURL(/messageId=/)
    await closeSearch.click()

    await expect(closeSearch).toBeHidden()
    await expect(page.getByRole('complementary', { name: 'Files' }).getByText(fileText)).toBeVisible()
    await expect(page).toHaveURL(/\/file\?/)
})

test('keeps the preview open after sending from an inactive session that resumes in place', async ({ page }) => {
    let resumed = false
    await page.route(`**/api${sessionPath}`, route => route.fulfill({ json: { session: createSession(Date.now(), resumed) } }))
    await page.route(`**/api${sessionPath}/resume`, route => {
        resumed = true
        return route.fulfill({ json: { sessionId } })
    })
    await page.route(`**/api${sessionPath}/messages`, route => route.request().method() === 'POST'
        ? route.fulfill({ json: { success: true } })
        : route.fallback())

    await page.goto(sessionPath)
    await page.getByRole('link', { name: 'Open notes' }).click()
    const composer = page.getByTestId('composer-shell').getByRole('textbox')
    await composer.fill(draftText)
    const sent = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api${sessionPath}/messages`)
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await sent

    await expect(page.getByRole('complementary', { name: 'Files' }).getByText(fileText)).toBeVisible()
    await expect(page).toHaveURL(/\/file\?/)
})

test('selects file contents after clicking inside the preview', async ({ page }) => {
    await page.goto(sessionPath)
    await page.getByRole('link', { name: 'Open notes' }).click()
    await page.getByRole('complementary', { name: 'Files' }).getByText(fileText).click()
    await page.keyboard.press('Control+a')

    const selection = await page.evaluate(() => window.getSelection()?.toString().trim())
    expect(selection).toBe(fileText)
})
