import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { useTheme } from 'styled-components'
import { expect, it } from 'vitest'
import { theme } from '../design-system'
import { AppProviders } from './AppProviders'

let seenClient: QueryClient | undefined
let seenTheme: unknown
function Probe() {
  seenClient = useQueryClient()
  seenTheme = useTheme()
  return <p>child content</p>
}

it('renders children with the supplied query client and the app theme', () => {
  const client = new QueryClient()
  render(
    <AppProviders client={client}>
      <Probe />
    </AppProviders>,
  )
  expect(screen.getByText('child content')).toBeInTheDocument()
  expect(seenClient).toBe(client)
  expect(seenTheme).toEqual(theme)
})
