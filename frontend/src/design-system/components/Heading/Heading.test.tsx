import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithTheme } from '../../../test/renderWithTheme'
import { Heading } from './Heading'

describe('Heading', () => {
  it('renders an h1 by default', () => {
    renderWithTheme(<Heading>Title</Heading>)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Title' }),
    ).toBeInTheDocument()
  })

  it.each([1, 2, 3] as const)(
    'renders level %s as the matching element',
    (level) => {
      renderWithTheme(<Heading level={level}>Title</Heading>)
      expect(screen.getByRole('heading', { level })).toBeInTheDocument()
    },
  )

  it('forwards props such as id', () => {
    renderWithTheme(<Heading id="x">Title</Heading>)
    expect(screen.getByRole('heading')).toHaveAttribute('id', 'x')
  })
})
