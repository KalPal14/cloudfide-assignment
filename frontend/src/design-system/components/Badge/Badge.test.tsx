import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithTheme } from '../../../test/renderWithTheme'
import { Badge } from './Badge'

describe('Badge', () => {
  it('renders its content and forwards props', () => {
    renderWithTheme(
      <Badge variant="success" title="state">
        Done
      </Badge>,
    )
    expect(screen.getByText('Done')).toHaveAttribute('title', 'state')
  })

  it('renders with the default variant', () => {
    renderWithTheme(<Badge>Neutral</Badge>)
    expect(screen.getByText('Neutral')).toBeInTheDocument()
  })
})
