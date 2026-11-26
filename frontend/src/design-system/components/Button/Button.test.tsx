import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithTheme } from '../../../test/renderWithTheme'
import { Button } from './Button'

describe('Button', () => {
  it('renders children and handles clicks', async () => {
    const onClick = vi.fn()
    renderWithTheme(<Button onClick={onClick}>Save</Button>)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled via the disabled prop or the disabled state', () => {
    const { rerender } = renderWithTheme(<Button disabled>Save</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
    rerender(<Button state="disabled">Save</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('stays enabled by default', () => {
    renderWithTheme(<Button>Save</Button>)
    expect(screen.getByRole('button')).toBeEnabled()
  })

  it('locked: disabled, shows lock icon and the children', () => {
    renderWithTheme(<Button state="locked">Publish</Button>)
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('🔒Publish')
  })

  it('locked without children falls back to "Locked", with a custom icon', () => {
    renderWithTheme(<Button state="locked" lockedIcon="#" />)
    expect(screen.getByRole('button')).toHaveTextContent('#Locked')
  })

  it('an explicit state wins over disabled=false but disabled=true still disables', () => {
    renderWithTheme(
      <Button state="normal" disabled>
        Save
      </Button>,
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
