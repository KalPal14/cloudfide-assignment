import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithTheme } from '../../../test/renderWithTheme'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('renders its icon and handles clicks', async () => {
    const onClick = vi.fn()
    renderWithTheme(
      <IconButton aria-label="Edit" onClick={onClick}>
        ✎
      </IconButton>,
    )
    const button = screen.getByRole('button', { name: 'Edit' })
    expect(button).toHaveTextContent('✎')
    await userEvent.setup().click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled via the disabled prop or the disabled state', () => {
    const { rerender } = renderWithTheme(
      <IconButton aria-label="Edit" disabled>
        ✎
      </IconButton>,
    )
    expect(screen.getByRole('button')).toBeDisabled()
    rerender(
      <IconButton aria-label="Edit" state="disabled">
        ✎
      </IconButton>,
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('locked: disabled and shows the lock icon instead of children', () => {
    renderWithTheme(
      <IconButton aria-label="Edit" state="locked">
        ✎
      </IconButton>,
    )
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('🔒')
    expect(button).not.toHaveTextContent('✎')
  })

  it('locked uses a custom lockedIcon', () => {
    renderWithTheme(
      <IconButton aria-label="Edit" state="locked" lockedIcon="#">
        ✎
      </IconButton>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('#')
  })
})
