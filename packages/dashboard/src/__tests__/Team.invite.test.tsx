import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { TeamSettings } from '@/src/pages/settings/Team'
import { resetTeammateBasesForTests } from '@/lib/publicLink'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

interface InviteReply { token: string; emailSent: boolean; inviteUrl: string | null }
const noHost = { lanHost: null, port: 4000, publicBaseUrl: null, agentRelayUrl: null }

// The page fires several requests at once, so dispatch on URL (dashboard AGENTS.md).
function stubFetch(invite: InviteReply, host: object = noHost) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/v1/relay/host')) return Promise.resolve({ ok: true, json: () => Promise.resolve(host) })
    if (url.includes('/api/v1/team/invite') && init?.method === 'POST') {
      return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve(invite) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** `undefined` is what a plain-HTTP LAN page has: no `navigator.clipboard` at all. */
function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  vi.stubGlobal('navigator', { ...navigator, clipboard: writeText ? { writeText } : undefined })
}

async function sendInvite() {
  render(<TeamSettings />)
  await userEvent.click(await screen.findByRole('button', { name: /invite member/i }))
  await userEvent.type(screen.getByLabelText(/email/i), 'qa@test.local')
  await userEvent.click(screen.getByRole('button', { name: /generate invite link/i }))
}

describe('Team — the invite link a teammate gets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetTeammateBasesForTests()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows and copies the link the relay mailed, not the browser address (#788)', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    stubClipboard(writeText)
    stubFetch({ token: 't', emailSent: false, inviteUrl: 'http://192.168.219.113:4000/invite?token=t' })

    await sendInvite()

    expect(await screen.findByText('http://192.168.219.113:4000/invite?token=t')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith('http://192.168.219.113:4000/invite?token=t')
    expect(screen.queryByText(/localhost:3000/)).not.toBeInTheDocument()
  })

  it('builds the link from the teammate base when the relay offers none', async () => {
    stubClipboard(vi.fn(async (_text: string) => {}))
    stubFetch({ token: 't', emailSent: false, inviteUrl: null }, { ...noHost, lanHost: '192.168.0.50' })

    await sendInvite()

    expect(await screen.findByText('http://192.168.0.50:4000/invite?token=t')).toBeInTheDocument()
  })

  it('says the link was copied only when it was', async () => {
    stubClipboard(vi.fn(async (_text: string) => {}))
    stubFetch({ token: 't', emailSent: false, inviteUrl: 'http://192.168.219.113:4000/invite?token=t' })

    await sendInvite()

    expect(await screen.findByText(/invite link copied to clipboard/i)).toBeInTheDocument()
  })

  it('does not claim a copy the browser refused', async () => {
    stubClipboard(vi.fn(async (_text: string) => { throw new Error('denied') }))
    stubFetch({ token: 't', emailSent: false, inviteUrl: 'http://192.168.219.113:4000/invite?token=t' })

    await sendInvite()

    // Wait for the outcome of the copy before asserting what was not said.
    expect(await screen.findByText(/copy this invite link/i)).toBeInTheDocument()
    expect(screen.queryByText(/invite link copied to clipboard/i)).not.toBeInTheDocument()
    expect(toast.warning).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.warning).mock.calls[0][0]).not.toMatch(/copied/i)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('treats a page with no clipboard API (plain HTTP) as a refused copy, not a failed invite', async () => {
    stubClipboard(undefined)
    stubFetch({ token: 't', emailSent: false, inviteUrl: 'http://192.168.219.113:4000/invite?token=t' })

    await sendInvite()

    expect(await screen.findByText(/copy this invite link/i)).toBeInTheDocument()
    expect(screen.getByText('http://192.168.219.113:4000/invite?token=t')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
