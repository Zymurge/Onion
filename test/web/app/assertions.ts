import { screen } from '@testing-library/react'
import { expect } from 'vitest'

export function expectMirroredUnitSelection(unitId: string, isSelected: boolean) {
  const expectedValue = String(isSelected)
  expect(screen.getByTestId(`combat-unit-${unitId}`).getAttribute('data-selected')).toBe(expectedValue)
  expect(screen.getByTestId(`hex-unit-${unitId}`).getAttribute('data-selected')).toBe(expectedValue)
}
