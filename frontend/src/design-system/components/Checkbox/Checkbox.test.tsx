import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithTheme } from '../../../test/renderWithTheme'
import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('is labelled by its text and toggles on label click', async () => {
    const onChange = vi.fn()
    renderWithTheme(<Checkbox label="Done" onChange={onChange} />)
    await userEvent.setup().click(screen.getByText('Done'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('checkbox', { name: 'Done' })).toBeChecked()
  })

  it('uses a provided id and forwards props such as checked and disabled', () => {
    renderWithTheme(
      <Checkbox id="custom" label="Done" checked disabled onChange={vi.fn()} />,
    )
    const box = screen.getByRole('checkbox', { name: 'Done' })
    expect(box).toHaveAttribute('id', 'custom')
    expect(box).toBeChecked()
    expect(box).toBeDisabled()
  })

  it('generates distinct ids for separate checkboxes', () => {
    renderWithTheme(
      <>
        <Checkbox label="A" />
        <Checkbox label="B" />
      </>,
    )
    expect(screen.getByLabelText('A').id).not.toBe(
      screen.getByLabelText('B').id,
    )
  })
})
