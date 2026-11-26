import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithTheme } from '../../../test/renderWithTheme'
import { Select } from './Select'

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
]

describe('Select', () => {
  it('renders options and associates the label with the select', () => {
    renderWithTheme(<Select label="Priority" options={options} />)
    const select = screen.getByLabelText('Priority')
    expect(select).toBe(screen.getByRole('combobox', { name: 'Priority' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Alpha',
      'Beta',
    ])
  })

  it('uses a provided id', () => {
    renderWithTheme(<Select id="custom" label="L" options={options} />)
    expect(screen.getByLabelText('L')).toHaveAttribute('id', 'custom')
  })

  it('reports changes', async () => {
    const onChange = vi.fn()
    renderWithTheme(<Select label="L" options={options} onChange={onChange} />)
    await userEvent.setup().selectOptions(screen.getByLabelText('L'), 'b')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('L')).toHaveValue('b')
  })

  it('describes the select with helper text, hint fallback, and prefers error', () => {
    const { rerender } = renderWithTheme(
      <Select label="L" options={options} hint="A hint" />,
    )
    const select = screen.getByLabelText('L')
    expect(select).toHaveAccessibleDescription('A hint')
    expect(select).toHaveAttribute('aria-invalid', 'false')

    rerender(
      <Select label="L" options={options} hint="A hint" helperText="Help" />,
    )
    expect(screen.getByLabelText('L')).toHaveAccessibleDescription('Help')
  })

  it('shows the error instead of helper text and marks the field invalid', () => {
    renderWithTheme(
      <Select label="L" options={options} helperText="Help" error="Required" />,
    )
    const select = screen.getByLabelText('L')
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('Required')
    expect(screen.queryByText('Help')).not.toBeInTheDocument()
  })

  it('has no description when there is no helper or error', () => {
    renderWithTheme(<Select label="L" options={options} />)
    expect(screen.getByLabelText('L')).not.toHaveAttribute('aria-describedby')
  })

  it('renders a tooltip only when given', () => {
    renderWithTheme(<Select label="L" tooltip="More info" options={options} />)
    expect(screen.getByLabelText('More info')).toBeInTheDocument()
  })

  it('disables the select when disabled', () => {
    renderWithTheme(<Select label="L" options={options} disabled />)
    expect(screen.getByLabelText('L')).toBeDisabled()
  })

  it('disables the select and shows a lock when locked', () => {
    const { container } = renderWithTheme(
      <Select label="L" options={options} state="locked" />,
    )
    expect(screen.getByLabelText('L')).toBeDisabled()
    expect(container).toHaveTextContent('🔒')
  })
})
