import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { theme } from '../design-system/theme/theme'

const withTheme = (ui: ReactElement) => (
  <ThemeProvider theme={theme}>{ui}</ThemeProvider>
)

export const renderWithTheme = (ui: ReactElement) => {
  const result = render(withTheme(ui))
  return {
    ...result,
    rerender: (next: ReactElement) => result.rerender(withTheme(next)),
  }
}
