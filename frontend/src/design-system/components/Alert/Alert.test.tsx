import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithTheme } from '../../../test/renderWithTheme'
import { Alert } from './Alert'

describe('Alert', () => {
  it('is a polite status by default', () => {
    renderWithTheme(<Alert>Saved</Alert>)
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })

  it('is an alert for the warning variant', () => {
    renderWithTheme(<Alert variant="warning">Careful</Alert>)
    expect(screen.getByRole('alert')).toHaveTextContent('Careful')
  })

  it('lets an explicit role override the variant default', () => {
    renderWithTheme(
      <Alert variant="warning" role="status">
        Careful
      </Alert>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
