// @vitest-environment jsdom
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/widget/ui'
import type { ChatMessage, WidgetApi } from '../../src/widget/api'

function fakeApi(overrides: Partial<WidgetApi> = {}): WidgetApi {
  return {
    history: vi.fn(async () => []),
    send: vi.fn(async () => []),
    openStream: vi.fn(() => () => {}),
    ...overrides,
  }
}

function mount(api: WidgetApi): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  act(() => {
    render(h(App, { gateway: 'http://gw.test', api }), root)
  })
  return root
}

async function openPanel(root: HTMLElement): Promise<void> {
  await act(async () => {
    ;(root.querySelector('.bubble') as HTMLButtonElement).click()
  })
}

async function typeText(root: HTMLElement, text: string): Promise<void> {
  const input = root.querySelector('.composer .text') as HTMLInputElement
  await act(async () => {
    input.value = text
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function clickSend(root: HTMLElement): Promise<void> {
  await act(async () => {
    ;(root.querySelector('.composer .send') as HTMLButtonElement).click()
  })
}

async function typeAndSend(root: HTMLElement, text: string): Promise<void> {
  await typeText(root, text)
  await clickSend(root)
}

/** Simulate picking a file in the attach input and wait for it to stage. */
async function pickFile(root: HTMLElement, file: File): Promise<void> {
  const input = root.querySelector('.composer .attach input[type="file"]') as HTMLInputElement
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  // FileReader resolves asynchronously; wait until the preview strip renders.
  for (let i = 0; i < 40 && !root.querySelector('.preview'); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })
  }
}

describe('widget App', () => {
  it('mounts a bubble and wires history + live stream on open', () => {
    const api = fakeApi()
    const root = mount(api)
    expect(root.querySelector('.bubble')).toBeTruthy()
    expect(api.history).toHaveBeenCalled()
    expect(api.openStream).toHaveBeenCalled()
  })

  it('opens the panel and renders an agent reply pushed over the stream', async () => {
    let emit: ((m: ChatMessage) => void) | undefined
    const api = fakeApi({
      openStream: vi.fn((_v, on) => {
        emit = on
        return () => {}
      }),
    })
    const root = mount(api)

    await openPanel(root)
    expect(root.querySelector('.panel.open')).toBeTruthy()
    expect(root.querySelector('.composer')).toBeTruthy()

    act(() => {
      emit?.({ role: 'out', type: 'text', text: 'hi from the agent' })
    })
    expect(root.textContent).toContain('hi from the agent')
  })

  it('sends a typed message optimistically and relays it to the api', async () => {
    const api = fakeApi()
    const root = mount(api)
    await openPanel(root)
    await typeAndSend(root, 'hello')
    expect(api.send).toHaveBeenCalled()
    expect(root.textContent).toContain('hello')
  })

  it('disables the composer and shows the typing indicator while waiting', async () => {
    const api = fakeApi() // send acks with no inline messages (deferred dispatch)
    const root = mount(api)
    await openPanel(root)
    await typeAndSend(root, 'anyone there?')

    const input = root.querySelector('.composer .text') as HTMLInputElement
    const send = root.querySelector('.composer .send') as HTMLButtonElement
    const mic = root.querySelector('.composer .icon-btn[aria-label="Record voice note"]') as HTMLButtonElement
    expect(input.disabled).toBe(true)
    expect(send.disabled).toBe(true)
    expect(mic.disabled).toBe(true)
    expect(root.querySelector('.typing')).toBeTruthy()
  })

  it('clears waiting and renders the reply when it arrives over SSE', async () => {
    let emit: ((m: ChatMessage) => void) | undefined
    const api = fakeApi({
      openStream: vi.fn((_v, on) => {
        emit = on
        return () => {}
      }),
    })
    const root = mount(api)
    await openPanel(root)
    await typeAndSend(root, 'ping')
    expect(root.querySelector('.typing')).toBeTruthy()

    act(() => {
      emit?.({ role: 'out', type: 'text', text: 'pong (seconds later)' })
    })
    expect(root.querySelector('.typing')).toBeFalsy()
    expect((root.querySelector('.composer .text') as HTMLInputElement).disabled).toBe(false)
    expect(root.textContent).toContain('pong (seconds later)')
  })

  it('renders a locally-sent image as an <img> thumbnail with its data URI', async () => {
    const dataUri = 'data:image/png;base64,aGVsbG8='
    const api = fakeApi({
      history: vi.fn(async () => [{ role: 'in', type: 'image', text: null, src: dataUri } as ChatMessage]),
    })
    const root = mount(api)
    await act(async () => {}) // flush history rehydration
    await openPanel(root)

    const img = root.querySelector('.msg.has-img img.thumb') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toBe(dataUri)
    expect(root.textContent).not.toContain('[image]')
  })

  it('renders an audio message as a "Voice note" bubble', async () => {
    const api = fakeApi({
      history: vi.fn(async () => [
        { role: 'in', type: 'audio', text: null, hasMedia: true } as ChatMessage,
      ]),
    })
    const root = mount(api)
    await act(async () => {}) // flush history rehydration
    await openPanel(root)

    const note = root.querySelector('.msg.media-note') as HTMLElement
    expect(note).toBeTruthy()
    expect(note.textContent).toContain('Voice note')
    expect(note.querySelector('svg')).toBeTruthy()
    expect(root.textContent).not.toContain('[voice note]')
  })

  it('renders a history image without a local src as an "Image" placeholder', async () => {
    const api = fakeApi({
      history: vi.fn(async () => [
        { role: 'in', type: 'image', text: null, hasMedia: true } as ChatMessage,
      ]),
    })
    const root = mount(api)
    await act(async () => {})
    await openPanel(root)

    const note = root.querySelector('.msg.media-note') as HTMLElement
    expect(note).toBeTruthy()
    expect(note.textContent).toContain('Image')
    expect(note.querySelector('svg')).toBeTruthy()
  })

  it('renders a history image with a caption as placeholder + text', async () => {
    const api = fakeApi({
      history: vi.fn(async () => [
        { role: 'in', type: 'image', text: 'my caption', hasMedia: true } as ChatMessage,
      ]),
    })
    const root = mount(api)
    await act(async () => {})
    await openPanel(root)

    const bubble = root.querySelector('.log .msg') as HTMLElement
    expect(bubble).toBeTruthy()
    expect(bubble.textContent).toContain('Image')
    expect(bubble.textContent).toContain('my caption')
    expect(bubble.querySelector('svg')).toBeTruthy()
  })

  it('stages a picked image in the composer without sending', async () => {
    const api = fakeApi()
    const root = mount(api)
    await openPanel(root)
    await pickFile(root, new File(['png-bytes'], 'pic.png', { type: 'image/png' }))

    const preview = root.querySelector('.preview img.preview-thumb') as HTMLImageElement
    expect(preview).toBeTruthy()
    expect(preview.getAttribute('src')).toMatch(/^data:image\/png/)
    expect(root.querySelector('.log img')).toBeFalsy() // not in the log
    expect(api.send).not.toHaveBeenCalled()
    expect(root.querySelector('.typing')).toBeFalsy()
  })

  it('sends staged image + caption together as one image message on Send', async () => {
    const api = fakeApi()
    const root = mount(api)
    await openPanel(root)
    await pickFile(root, new File(['png-bytes'], 'pic.png', { type: 'image/png' }))
    await typeText(root, 'here is my receipt')
    await clickSend(root)

    expect(api.send).toHaveBeenCalledTimes(1)
    const [, payload] = (api.send as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(payload.type).toBe('image')
    expect(payload.text).toBe('here is my receipt')
    expect(payload.media?.mime).toBe('image/png')
    expect(payload.media?.dataUri).toMatch(/^data:image\/png/)

    // One bubble carrying both the thumbnail and the caption.
    const bubbles = root.querySelectorAll('.log .msg.has-img')
    expect(bubbles.length).toBe(1)
    expect(bubbles[0].querySelector('img.thumb')).toBeTruthy()
    expect(bubbles[0].textContent).toContain('here is my receipt')

    // Staged state cleared; waiting engaged.
    expect(root.querySelector('.preview')).toBeFalsy()
    expect((root.querySelector('.composer .text') as HTMLInputElement).value).toBe('')
    expect(root.querySelector('.typing')).toBeTruthy()
  })

  it('sends a staged image alone when Send is pressed with no caption', async () => {
    const api = fakeApi()
    const root = mount(api)
    await openPanel(root)
    await pickFile(root, new File(['png-bytes'], 'pic.png', { type: 'image/png' }))
    await clickSend(root)

    expect(api.send).toHaveBeenCalledTimes(1)
    const [, payload] = (api.send as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(payload.type).toBe('image')
    expect(payload.text).toBeUndefined()
    expect(payload.media?.dataUri).toMatch(/^data:image\/png/)
    expect(root.querySelector('.log .msg.has-img img.thumb')).toBeTruthy()
  })

  it('removes the staged image via the X without sending', async () => {
    const api = fakeApi()
    const root = mount(api)
    await openPanel(root)
    await pickFile(root, new File(['png-bytes'], 'pic.png', { type: 'image/png' }))
    expect(root.querySelector('.preview')).toBeTruthy()

    await act(async () => {
      ;(root.querySelector('.preview .preview-remove') as HTMLButtonElement).click()
    })
    expect(root.querySelector('.preview')).toBeFalsy()
    expect(api.send).not.toHaveBeenCalled()
  })

  it('resets the file input after staging so the same file can be re-picked', async () => {
    const api = fakeApi()
    const root = mount(api)
    await openPanel(root)
    const input = root.querySelector('.composer .attach input[type="file"]') as HTMLInputElement
    await pickFile(root, new File(['png-bytes'], 'pic.png', { type: 'image/png' }))
    expect(input.value).toBe('')
  })
})
