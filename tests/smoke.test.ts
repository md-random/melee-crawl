import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '#shared/types'

describe('scaffold', () => {
  it('resolves shared types', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })
})
