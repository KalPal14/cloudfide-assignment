import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithTheme } from '../../../test/renderWithTheme'
import { Card } from './Card'

describe('Card', () => {
  it('renders children and forwards props', () => {
    renderWithTheme(
      <Card aria-label="Task card">
        <p>Body</p>
      </Card>,
    )
    expect(screen.getByLabelText('Task card')).toContainElement(
      screen.getByText('Body'),
    )
  })
})
