import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithTheme } from '../../../test/renderWithTheme'
import { Input } from './Input'

describe('Input', () => {
  it('associates the label with a text input and reports typing', async () => {
    const onChange = vi.fn()
    renderWithTheme(<Input label="Title" onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Title' })
    await userEvent.setup().type(input, 'ab')
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(input).toHaveValue('ab')
  })

  it('uses a provided id', () => {
    renderWithTheme(<Input id="custom" label="Title" />)
    expect(screen.getByLabelText('Title')).toHaveAttribute('id', 'custom')
  })

  it('renders a textarea with the given rows when multiline', () => {
    renderWithTheme(<Input label="Notes" multiline rows={7} />)
    const area = screen.getByLabelText('Notes')
    expect(area.tagName).toBe('TEXTAREA')
    expect(area).toHaveAttribute('rows', '7')
  })

  it('defaults a multiline textarea to 4 rows', () => {
    renderWithTheme(<Input label="Notes" multiline />)
    expect(screen.getByLabelText('Notes')).toHaveAttribute('rows', '4')
  })

  it('describes the field with helper text or hint, preferring helper text', () => {
    const { rerender } = renderWithTheme(<Input label="T" hint="A hint" />)
    expect(screen.getByLabelText('T')).toHaveAccessibleDescription('A hint')
    rerender(<Input label="T" hint="A hint" helperText="Help" />)
    expect(screen.getByLabelText('T')).toHaveAccessibleDescription('Help')
  })

  it('shows the error in place of helper text and marks the field invalid', () => {
    renderWithTheme(<Input label="T" helperText="Help" error="Too short" />)
    const input = screen.getByLabelText('T')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Too short')
    expect(screen.queryByText('Help')).not.toBeInTheDocument()
  })

  it('has no description and is valid by default', () => {
    renderWithTheme(<Input label="T" />)
    const input = screen.getByLabelText('T')
    expect(input).not.toHaveAttribute('aria-describedby')
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })

  it('renders a tooltip only when given', () => {
    renderWithTheme(<Input label="T" tooltip="More info" />)
    expect(screen.getByLabelText('More info')).toBeInTheDocument()
  })

  it('disables the field when disabled', () => {
    renderWithTheme(<Input label="T" disabled />)
    expect(screen.getByLabelText('T')).toBeDisabled()
  })

  it.each([false, true])(
    'locks the field (multiline=%s): disabled, read-only, lock icon',
    (multiline) => {
      const { container } = renderWithTheme(
        <Input label="T" state="locked" multiline={multiline} />,
      )
      const field = screen.getByLabelText('T')
      expect(field).toBeDisabled()
      expect(field).toHaveAttribute('readonly')
      expect(container).toHaveTextContent('🔒')
    },
  )
})
