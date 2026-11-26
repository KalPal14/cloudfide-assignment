import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithTheme } from '../../../test/renderWithTheme'
import { Text } from './Text'

describe('Text', () => {
  it('renders its content and forwards props without leaking style props to the DOM', () => {
    renderWithTheme(
      <Text muted size="body" preserveWhitespace data-testid="t">
        Hello
      </Text>,
    )
    const el = screen.getByTestId('t')
    expect(el).toHaveTextContent('Hello')
    expect(el).not.toHaveAttribute('muted')
    expect(el).not.toHaveAttribute('preservewhitespace')
  })
})
