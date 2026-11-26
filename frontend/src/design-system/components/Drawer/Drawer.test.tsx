import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithTheme } from '../../../test/renderWithTheme'
import { Drawer } from './Drawer'

const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
})
const close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute('open')
})

beforeEach(() => {
  showModal.mockClear()
  close.mockClear()
  HTMLDialogElement.prototype.showModal = showModal
  HTMLDialogElement.prototype.close = close
})

const getDialog = () => document.querySelector('dialog') as HTMLDialogElement

describe('Drawer', () => {
  it('opens as a modal, labelled by its title, and focuses the first enabled field', () => {
    renderWithTheme(
      <Drawer title="Edit task" isOpen onClose={vi.fn()}>
        <input disabled aria-label="disabled" />
        <input aria-label="Name" />
      </Drawer>,
    )

    expect(showModal).toHaveBeenCalledTimes(1)
    expect(getDialog()).toHaveAccessibleName('Edit task')
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  it('does not open while closed', () => {
    renderWithTheme(
      <Drawer title="T" isOpen={false} onClose={vi.fn()}>
        x
      </Drawer>,
    )
    expect(showModal).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })

  it('closes the dialog when isOpen turns false', () => {
    const { rerender } = renderWithTheme(
      <Drawer title="T" isOpen onClose={vi.fn()}>
        x
      </Drawer>,
    )
    rerender(
      <Drawer title="T" isOpen={false} onClose={vi.fn()}>
        x
      </Drawer>,
    )
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('calls onClose from the Close button', () => {
    const onClose = vi.fn()
    renderWithTheme(
      <Drawer title="T" isOpen onClose={onClose}>
        x
      </Drawer>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape (cancel, default prevented) and on backdrop click', () => {
    const onClose = vi.fn()
    renderWithTheme(
      <Drawer title="T" isOpen onClose={onClose}>
        <p>content</p>
      </Drawer>,
    )
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(getDialog(), cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(getDialog())
    expect(onClose).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByText('content'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('ignores Escape and backdrop clicks and disables Close while busy', () => {
    const onClose = vi.fn()
    renderWithTheme(
      <Drawer title="T" isOpen busy onClose={onClose}>
        x
      </Drawer>,
    )
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(getDialog(), cancel)
    fireEvent.click(getDialog())

    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    expect(getDialog()).toHaveAttribute('aria-busy', 'true')
  })
})
