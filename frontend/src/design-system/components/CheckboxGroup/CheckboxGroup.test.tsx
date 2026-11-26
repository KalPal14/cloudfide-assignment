import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithTheme } from '../../../test/renderWithTheme'
import { CheckboxGroup } from './CheckboxGroup'

const options = ['red', 'green', 'blue']

describe('CheckboxGroup', () => {
  it('renders one checkbox per option, checked according to value', () => {
    renderWithTheme(
      <CheckboxGroup
        label="Colors"
        options={options}
        value={['green']}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('checkbox', { name: 'red' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'green' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'blue' })).not.toBeChecked()
  })

  it('adds an unchecked option to the value', async () => {
    const onChange = vi.fn()
    renderWithTheme(
      <CheckboxGroup
        label="Colors"
        options={options}
        value={['green']}
        onChange={onChange}
      />,
    )
    await userEvent
      .setup()
      .click(screen.getByRole('checkbox', { name: 'blue' }))
    expect(onChange).toHaveBeenCalledWith(['green', 'blue'])
  })

  it('removes a checked option from the value', async () => {
    const onChange = vi.fn()
    renderWithTheme(
      <CheckboxGroup
        label="Colors"
        options={options}
        value={['red', 'green']}
        onChange={onChange}
      />,
    )
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'red' }))
    expect(onChange).toHaveBeenCalledWith(['green'])
  })

  it('disables every checkbox when disabled', () => {
    renderWithTheme(
      <CheckboxGroup
        label="Colors"
        options={options}
        value={[]}
        onChange={vi.fn()}
        disabled
      />,
    )
    screen.getAllByRole('checkbox').forEach((box) => expect(box).toBeDisabled())
  })

  it('shows the error instead of the helper, or the helper alone, or neither', () => {
    const base = { label: 'Colors', options, value: [], onChange: vi.fn() }
    const { rerender } = renderWithTheme(
      <CheckboxGroup {...base} helper="Pick some" error="Pick at least one" />,
    )
    expect(screen.getByText('Pick at least one')).toBeInTheDocument()
    expect(screen.queryByText('Pick some')).not.toBeInTheDocument()

    rerender(<CheckboxGroup {...base} helper="Pick some" />)
    expect(screen.getByText('Pick some')).toBeInTheDocument()

    rerender(<CheckboxGroup {...base} />)
    expect(screen.queryByText('Pick some')).not.toBeInTheDocument()
  })

  it('renders a tooltip only when given', () => {
    renderWithTheme(
      <CheckboxGroup
        label="Colors"
        tooltip="More info"
        options={options}
        value={[]}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('More info')).toBeInTheDocument()
  })
})
